use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use margin_core::{
    anchor_for_selection, apply_replacements, render_sidecar_yaml, Anchor, PublishedReview,
    Replacement, SidecarComment, SidecarSuggestion,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::{collections::HashMap, convert::Infallible, env, sync::Arc, time::Duration};
use tokio::{sync::Mutex, time::interval};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use utoipa::{OpenApi, ToSchema};
use uuid::Uuid;

const SAMPLE_MARKDOWN: &str = r#"# Margin Product Brief

Margin lets business users review Markdown documents without learning Git.

## Goals

- Keep Markdown as the canonical source of truth.
- Provide a calm document-like review surface.
- Publish finished reviews as GitHub pull requests.
- Preserve nested implementation notes:
  - Track anchors with line range, quote, heading path, and content hash.
  - Keep draft comments in the app until the reviewer publishes.

## Review checklist

- [x] Keep the reviewer away from Git mechanics.
- [ ] Support local Markdown editing.
- [ ] Package published review metadata for engineers.

## Rollout plan

| Milestone | Owner | Status |
| --- | :---: | ---: |
| Local editor | Product | Draft |
| GitHub publishing | Engineering | Next |
| Anchor reattachment | Engineering | In progress |

```yaml
review:
  repo: acme/docs
  file: docs/product/margin.md
  status: in_review
```

## Non-goals

Margin does not try to become a full WYSIWYG Markdown editor in v1.
"#;

#[derive(Clone)]
struct AppState {
    db: Option<PgPool>,
    reviews: Arc<Mutex<HashMap<Uuid, Review>>>,
    publish_jobs: Arc<Mutex<HashMap<Uuid, PublishJob>>>,
}

#[derive(OpenApi)]
#[openapi(
    paths(
        health,
        openapi_json,
        list_repos,
        get_document,
        create_review,
        add_comment,
        add_suggestion,
        set_suggestion_status,
        set_approval,
        publish_review,
        get_publish_job,
        review_events
    ),
    components(schemas(
        RepoSummary,
        DocumentResponse,
        CreateReviewRequest,
        Review,
        AddCommentRequest,
        AddSuggestionRequest,
        SetSuggestionStatusRequest,
        SetApprovalRequest,
        PublishResponse,
        PublishJob,
        ApiAnchor,
        ApiComment,
        ApiSuggestion
    ))
)]
struct ApiDoc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let db = match env::var("DATABASE_URL") {
        Ok(url) => Some(PgPool::connect(&url).await?),
        Err(_) => {
            tracing::warn!("DATABASE_URL is not set; running with in-memory review state");
            None
        }
    };

    let state = AppState {
        db,
        reviews: Arc::new(Mutex::new(HashMap::new())),
        publish_jobs: Arc::new(Mutex::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/openapi.json", get(openapi_json))
        .route("/api/repos", get(list_repos))
        .route("/api/documents/{id}", get(get_document))
        .route("/api/reviews", post(create_review))
        .route("/api/reviews/{id}/comments", post(add_comment))
        .route("/api/reviews/{id}/suggestions", post(add_suggestion))
        .route(
            "/api/reviews/{id}/suggestions/{suggestion_id}/status",
            post(set_suggestion_status),
        )
        .route("/api/reviews/{id}/approval", post(set_approval))
        .route("/api/reviews/{id}/publish", post(publish_review))
        .route("/api/reviews/{id}/events", get(review_events))
        .route("/api/publish-jobs/{id}", get(get_publish_job))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let port = env::var("PORT").unwrap_or_else(|_| "4317".to_string());
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}")).await?;
    tracing::info!("margin-api listening on http://127.0.0.1:{port}");
    axum::serve(listener, app).await?;

    Ok(())
}

#[utoipa::path(get, path = "/health", responses((status = 200, body = HealthResponse)))]
async fn health(State(state): State<AppState>) -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        database: state.db.is_some(),
    })
}

#[utoipa::path(get, path = "/openapi.json", responses((status = 200)))]
async fn openapi_json() -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}

#[utoipa::path(get, path = "/api/repos", responses((status = 200, body = [RepoSummary])))]
async fn list_repos() -> Json<Vec<RepoSummary>> {
    Json(vec![RepoSummary {
        id: "github:acme/docs".into(),
        name: "acme/docs".into(),
        provider: "github".into(),
        default_branch: "main".into(),
    }])
}

#[utoipa::path(get, path = "/api/documents/{id}", responses((status = 200, body = DocumentResponse)))]
async fn get_document(Path(id): Path<String>) -> Json<DocumentResponse> {
    Json(DocumentResponse {
        id,
        repo: "acme/docs".into(),
        file_path: "docs/product/margin.md".into(),
        source_commit: "sample-local-commit".into(),
        markdown: SAMPLE_MARKDOWN.into(),
    })
}

#[utoipa::path(post, path = "/api/reviews", request_body = CreateReviewRequest, responses((status = 200, body = Review)))]
async fn create_review(
    State(state): State<AppState>,
    Json(req): Json<CreateReviewRequest>,
) -> Json<Review> {
    let review = Review {
        id: Uuid::new_v4(),
        repo: req.repo,
        file_path: req.file_path,
        source_commit: req.source_commit,
        reviewer: req.reviewer,
        approval: None,
        comments: vec![],
        suggestions: vec![],
        created_at: Utc::now(),
    };

    state.reviews.lock().await.insert(review.id, review.clone());
    Json(review)
}

#[utoipa::path(post, path = "/api/reviews/{id}/comments", request_body = AddCommentRequest, responses((status = 200, body = Review)))]
async fn add_comment(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<AddCommentRequest>,
) -> Result<Json<Review>, ApiError> {
    let anchor = make_anchor(&req.quote)?;
    let mut reviews = state.reviews.lock().await;
    let review = reviews.get_mut(&id).ok_or(ApiError::not_found("review"))?;
    review.comments.push(ApiComment {
        id: Uuid::new_v4(),
        author: req.author,
        body: req.body,
        resolved: false,
        anchor,
        created_at: Utc::now(),
    });
    Ok(Json(review.clone()))
}

#[utoipa::path(post, path = "/api/reviews/{id}/suggestions", request_body = AddSuggestionRequest, responses((status = 200, body = Review)))]
async fn add_suggestion(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<AddSuggestionRequest>,
) -> Result<Json<Review>, ApiError> {
    let anchor = make_anchor(&req.original)?;
    let mut reviews = state.reviews.lock().await;
    let review = reviews.get_mut(&id).ok_or(ApiError::not_found("review"))?;
    review.suggestions.push(ApiSuggestion {
        id: Uuid::new_v4(),
        author: req.author,
        original: req.original,
        replacement: req.replacement,
        applied: true,
        resolved: false,
        anchor,
        created_at: Utc::now(),
    });
    Ok(Json(review.clone()))
}

#[utoipa::path(post, path = "/api/reviews/{id}/suggestions/{suggestion_id}/status", request_body = SetSuggestionStatusRequest, responses((status = 200, body = Review)))]
async fn set_suggestion_status(
    State(state): State<AppState>,
    Path((id, suggestion_id)): Path<(Uuid, Uuid)>,
    Json(req): Json<SetSuggestionStatusRequest>,
) -> Result<Json<Review>, ApiError> {
    let mut reviews = state.reviews.lock().await;
    let review = reviews.get_mut(&id).ok_or(ApiError::not_found("review"))?;
    let suggestion = review
        .suggestions
        .iter_mut()
        .find(|suggestion| suggestion.id == suggestion_id)
        .ok_or(ApiError::not_found("suggestion"))?;

    if let Some(applied) = req.applied {
        suggestion.applied = applied;
    }

    if let Some(resolved) = req.resolved {
        suggestion.resolved = resolved;
    }

    Ok(Json(review.clone()))
}

#[utoipa::path(post, path = "/api/reviews/{id}/approval", request_body = SetApprovalRequest, responses((status = 200, body = Review)))]
async fn set_approval(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<SetApprovalRequest>,
) -> Result<Json<Review>, ApiError> {
    let mut reviews = state.reviews.lock().await;
    let review = reviews.get_mut(&id).ok_or(ApiError::not_found("review"))?;
    review.approval = Some(req.status);
    Ok(Json(review.clone()))
}

#[utoipa::path(post, path = "/api/reviews/{id}/publish", responses((status = 200, body = PublishResponse)))]
async fn publish_review(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<PublishResponse>, ApiError> {
    let review = {
        let reviews = state.reviews.lock().await;
        reviews
            .get(&id)
            .cloned()
            .ok_or(ApiError::not_found("review"))?
    };

    let replacements: Vec<Replacement> = review
        .suggestions
        .iter()
        .filter(|suggestion| suggestion.applied)
        .map(|suggestion| Replacement {
            original: suggestion.original.clone(),
            replacement: suggestion.replacement.clone(),
        })
        .collect();

    let patched_markdown = apply_replacements(SAMPLE_MARKDOWN, &replacements)
        .map_err(|err| ApiError::bad_request(err.to_string()))?;

    let published = PublishedReview {
        margin_review_schema: 1,
        review_id: review.id,
        repo: review.repo.clone(),
        file_path: review.file_path.clone(),
        source_commit: review.source_commit.clone(),
        published_at: Utc::now(),
        reviewer: review.reviewer.clone(),
        approval: review.approval.clone(),
        comments: review
            .comments
            .iter()
            .map(|comment| SidecarComment {
                id: comment.id,
                author: comment.author.clone(),
                body: comment.body.clone(),
                resolved: comment.resolved,
                anchor: comment.anchor.clone().into(),
            })
            .collect(),
        suggestions: review
            .suggestions
            .iter()
            .map(|suggestion| SidecarSuggestion {
                id: suggestion.id,
                author: suggestion.author.clone(),
                original: suggestion.original.clone(),
                replacement: suggestion.replacement.clone(),
                applied: suggestion.applied,
                resolved: suggestion.resolved,
                anchor: suggestion.anchor.clone().into(),
            })
            .collect(),
    };

    let sidecar_yaml =
        render_sidecar_yaml(&published).map_err(|err| ApiError::bad_request(err.to_string()))?;
    let job = PublishJob {
        id: Uuid::new_v4(),
        review_id: review.id,
        status: "ready_for_github_app".into(),
        pr_url: None,
        created_at: Utc::now(),
    };
    state.publish_jobs.lock().await.insert(job.id, job.clone());

    Ok(Json(PublishResponse {
        job,
        branch_name: format!("margin/review-{}", &review.id.to_string()[..8]),
        markdown_patch_preview: patched_markdown,
        sidecar_path: "docs/product/margin.margin-review.yml".into(),
        sidecar_yaml,
    }))
}

#[utoipa::path(get, path = "/api/publish-jobs/{id}", responses((status = 200, body = PublishJob)))]
async fn get_publish_job(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<PublishJob>, ApiError> {
    let jobs = state.publish_jobs.lock().await;
    Ok(Json(
        jobs.get(&id)
            .cloned()
            .ok_or(ApiError::not_found("publish job"))?,
    ))
}

#[utoipa::path(get, path = "/api/reviews/{id}/events", responses((status = 200)))]
async fn review_events(
    Path(id): Path<Uuid>,
) -> Sse<impl futures_util::Stream<Item = Result<Event, Infallible>>> {
    let stream = async_stream::stream! {
        let mut tick = interval(Duration::from_secs(10));
        loop {
            tick.tick().await;
            yield Ok(Event::default().event("heartbeat").data(id.to_string()));
        }
    };

    Sse::new(stream).keep_alive(KeepAlive::default())
}

fn make_anchor(quote: &str) -> Result<ApiAnchor, ApiError> {
    anchor_for_selection(SAMPLE_MARKDOWN, quote)
        .map(ApiAnchor::from)
        .ok_or_else(|| ApiError::bad_request("selected text could not be anchored"))
}

#[derive(Debug, Serialize, ToSchema)]
struct HealthResponse {
    ok: bool,
    database: bool,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
struct RepoSummary {
    id: String,
    name: String,
    provider: String,
    default_branch: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
struct DocumentResponse {
    id: String,
    repo: String,
    file_path: String,
    source_commit: String,
    markdown: String,
}

#[derive(Debug, Deserialize, ToSchema)]
struct CreateReviewRequest {
    repo: String,
    file_path: String,
    source_commit: String,
    reviewer: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
struct Review {
    id: Uuid,
    repo: String,
    file_path: String,
    source_commit: String,
    reviewer: String,
    approval: Option<String>,
    comments: Vec<ApiComment>,
    suggestions: Vec<ApiSuggestion>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
struct AddCommentRequest {
    author: String,
    body: String,
    quote: String,
}

#[derive(Debug, Deserialize, ToSchema)]
struct AddSuggestionRequest {
    author: String,
    original: String,
    replacement: String,
}

#[derive(Debug, Deserialize, ToSchema)]
struct SetSuggestionStatusRequest {
    applied: Option<bool>,
    resolved: Option<bool>,
}

#[derive(Debug, Deserialize, ToSchema)]
struct SetApprovalRequest {
    status: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
struct ApiComment {
    id: Uuid,
    author: String,
    body: String,
    resolved: bool,
    anchor: ApiAnchor,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
struct ApiSuggestion {
    id: Uuid,
    author: String,
    original: String,
    replacement: String,
    applied: bool,
    resolved: bool,
    anchor: ApiAnchor,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
struct ApiAnchor {
    start_line: usize,
    end_line: usize,
    quote: String,
    prefix: String,
    suffix: String,
    heading_path: Vec<String>,
    content_hash: String,
}

impl From<Anchor> for ApiAnchor {
    fn from(anchor: Anchor) -> Self {
        Self {
            start_line: anchor.start_line,
            end_line: anchor.end_line,
            quote: anchor.quote,
            prefix: anchor.prefix,
            suffix: anchor.suffix,
            heading_path: anchor.heading_path,
            content_hash: anchor.content_hash,
        }
    }
}

impl From<ApiAnchor> for Anchor {
    fn from(anchor: ApiAnchor) -> Self {
        Self {
            start_line: anchor.start_line,
            end_line: anchor.end_line,
            quote: anchor.quote,
            prefix: anchor.prefix,
            suffix: anchor.suffix,
            heading_path: anchor.heading_path,
            content_hash: anchor.content_hash,
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
struct PublishJob {
    id: Uuid,
    review_id: Uuid,
    status: String,
    pr_url: Option<String>,
    created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, ToSchema)]
struct PublishResponse {
    job: PublishJob,
    branch_name: String,
    markdown_patch_preview: String,
    sidecar_path: String,
    sidecar_yaml: String,
}

struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn not_found(resource: &str) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            message: format!("{resource} not found"),
        }
    }

    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        (
            self.status,
            Json(serde_json::json!({ "error": self.message })),
        )
            .into_response()
    }
}
