use crate::Anchor;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishedReview {
    pub margin_review_schema: u8,
    pub review_id: Uuid,
    pub repo: String,
    pub file_path: String,
    pub source_commit: String,
    pub published_at: DateTime<Utc>,
    pub reviewer: String,
    pub approval: Option<String>,
    pub comments: Vec<SidecarComment>,
    pub suggestions: Vec<SidecarSuggestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarComment {
    pub id: Uuid,
    pub author: String,
    pub body: String,
    pub resolved: bool,
    pub anchor: Anchor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarSuggestion {
    pub id: Uuid,
    pub author: String,
    pub original: String,
    pub replacement: String,
    pub applied: bool,
    pub resolved: bool,
    pub anchor: Anchor,
}

pub fn render_sidecar_yaml(review: &PublishedReview) -> anyhow::Result<String> {
    Ok(serde_yaml::to_string(review)?)
}
