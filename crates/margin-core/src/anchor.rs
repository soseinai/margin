use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const CONTEXT_CHARS: usize = 120;
const MAX_CANDIDATES: usize = 5;
const MIN_CONFIDENT_SCORE: u16 = 50;
const AMBIGUITY_MARGIN: u16 = 6;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Anchor {
    pub start_line: usize,
    pub end_line: usize,
    pub quote: String,
    pub prefix: String,
    pub suffix: String,
    pub heading_path: Vec<String>,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnchorReattachStatus {
    Attached,
    Relocated,
    NeedsReattachment,
    Missing,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AnchorCandidate {
    pub anchor: Anchor,
    pub score: u16,
    pub signals: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AnchorReattachment {
    pub status: AnchorReattachStatus,
    pub anchor: Option<Anchor>,
    pub candidates: Vec<AnchorCandidate>,
}

pub fn anchor_for_selection(markdown: &str, quote: &str) -> Option<Anchor> {
    let start = markdown.find(quote)?;
    let end = start + quote.len();
    Some(anchor_for_range(markdown, start, end, quote))
}

pub fn reattach_anchor(markdown: &str, anchor: &Anchor) -> AnchorReattachment {
    if anchor.quote.is_empty() {
        return AnchorReattachment {
            status: AnchorReattachStatus::Missing,
            anchor: None,
            candidates: Vec::new(),
        };
    }

    let mut candidates = exact_quote_candidates(markdown, anchor);

    if candidates.is_empty() {
        return AnchorReattachment {
            status: AnchorReattachStatus::Missing,
            anchor: None,
            candidates,
        };
    }

    candidates.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.anchor.start_line.cmp(&right.anchor.start_line))
    });
    candidates.truncate(MAX_CANDIDATES);

    let best = &candidates[0];
    let second_score = candidates.get(1).map(|candidate| candidate.score);
    let ambiguous =
        second_score.is_some_and(|score| best.score.saturating_sub(score) < AMBIGUITY_MARGIN);

    if best.score < MIN_CONFIDENT_SCORE || ambiguous {
        return AnchorReattachment {
            status: AnchorReattachStatus::NeedsReattachment,
            anchor: None,
            candidates,
        };
    }

    let status =
        if best.anchor.start_line == anchor.start_line && best.anchor.end_line == anchor.end_line {
            AnchorReattachStatus::Attached
        } else {
            AnchorReattachStatus::Relocated
        };

    AnchorReattachment {
        status,
        anchor: Some(best.anchor.clone()),
        candidates,
    }
}

pub fn heading_path_before(markdown: &str, byte_offset: usize) -> Vec<String> {
    let mut path: Vec<(usize, String)> = Vec::new();
    for line in markdown[..byte_offset.min(markdown.len())].lines() {
        let trimmed = line.trim_start();
        if !trimmed.starts_with('#') {
            continue;
        }

        let level = trimmed.chars().take_while(|c| *c == '#').count();
        if level == 0 || level > 6 || !trimmed.chars().nth(level).is_some_and(|c| c == ' ') {
            continue;
        }

        let title = trimmed[level..].trim().to_owned();
        path.retain(|(existing_level, _)| *existing_level < level);
        path.push((level, title));
    }

    path.into_iter().map(|(_, title)| title).collect()
}

fn context_before(markdown: &str, start: usize) -> String {
    let context_start = char_boundary_before(markdown, start.saturating_sub(CONTEXT_CHARS));
    markdown[context_start..start].to_owned()
}

fn context_after(markdown: &str, end: usize) -> String {
    let context_end = char_boundary_after(markdown, (end + CONTEXT_CHARS).min(markdown.len()));
    markdown[end..context_end].to_owned()
}

fn hash_text(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn anchor_for_range(markdown: &str, start: usize, end: usize, quote: &str) -> Anchor {
    Anchor {
        start_line: line_for_offset(markdown, start),
        end_line: line_for_offset(markdown, end),
        quote: quote.to_owned(),
        prefix: context_before(markdown, start),
        suffix: context_after(markdown, end),
        heading_path: heading_path_before(markdown, start),
        content_hash: hash_text(quote),
    }
}

fn exact_quote_candidates(markdown: &str, anchor: &Anchor) -> Vec<AnchorCandidate> {
    markdown
        .match_indices(&anchor.quote)
        .map(|(start, quote)| {
            let end = start + quote.len();
            let candidate_anchor = anchor_for_range(markdown, start, end, quote);
            score_candidate(anchor, candidate_anchor)
        })
        .collect()
}

fn score_candidate(original: &Anchor, candidate: Anchor) -> AnchorCandidate {
    let mut score = 0;
    let mut signals = Vec::new();

    if candidate.content_hash == original.content_hash {
        score += 50;
        signals.push("quote_hash".to_owned());
    }

    if candidate.heading_path == original.heading_path {
        score += 24;
        signals.push("heading_path".to_owned());
    } else {
        let common = common_heading_prefix_len(&original.heading_path, &candidate.heading_path);
        if common > 0 {
            let points = (common as u16 * 6).min(18);
            score += points;
            signals.push(format!("heading_prefix:{common}"));
        }
    }

    let prefix_score =
        context_similarity_score(&original.prefix, &candidate.prefix, ContextSide::Before);
    if prefix_score > 0 {
        score += prefix_score;
        signals.push(format!("prefix:{prefix_score}"));
    }

    let suffix_score =
        context_similarity_score(&original.suffix, &candidate.suffix, ContextSide::After);
    if suffix_score > 0 {
        score += suffix_score;
        signals.push(format!("suffix:{suffix_score}"));
    }

    let line_distance = original.start_line.abs_diff(candidate.start_line);
    if line_distance == 0 {
        score += 8;
        signals.push("line_exact".to_owned());
    } else if line_distance <= 3 {
        score += 4;
        signals.push(format!("line_near:{line_distance}"));
    }

    AnchorCandidate {
        anchor: candidate,
        score,
        signals,
    }
}

#[derive(Debug, Clone, Copy)]
enum ContextSide {
    Before,
    After,
}

fn context_similarity_score(original: &str, candidate: &str, side: ContextSide) -> u16 {
    let common = match side {
        ContextSide::Before => common_suffix_chars(original, candidate),
        ContextSide::After => common_prefix_chars(original, candidate),
    };

    ((common / 4).min(18)) as u16
}

fn common_heading_prefix_len(left: &[String], right: &[String]) -> usize {
    left.iter()
        .zip(right)
        .take_while(|(left, right)| left == right)
        .count()
}

fn common_prefix_chars(left: &str, right: &str) -> usize {
    left.chars()
        .zip(right.chars())
        .take_while(|(left, right)| left == right)
        .count()
}

fn common_suffix_chars(left: &str, right: &str) -> usize {
    left.chars()
        .rev()
        .zip(right.chars().rev())
        .take_while(|(left, right)| left == right)
        .count()
}

fn line_for_offset(markdown: &str, offset: usize) -> usize {
    markdown[..offset.min(markdown.len())]
        .bytes()
        .filter(|byte| *byte == b'\n')
        .count()
        + 1
}

fn char_boundary_before(text: &str, offset: usize) -> usize {
    let mut safe = offset.min(text.len());
    while safe > 0 && !text.is_char_boundary(safe) {
        safe -= 1;
    }
    safe
}

fn char_boundary_after(text: &str, offset: usize) -> usize {
    let mut safe = offset.min(text.len());
    while safe < text.len() && !text.is_char_boundary(safe) {
        safe += 1;
    }
    safe
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn creates_anchor_with_heading_path() {
        let md = "# Spec\n\n## Goals\n\nBusiness users review Markdown.";
        let anchor = anchor_for_selection(md, "Business users").unwrap();
        assert_eq!(anchor.start_line, 5);
        assert_eq!(anchor.heading_path, vec!["Spec", "Goals"]);
    }

    #[test]
    fn reattaches_exact_anchor_in_unchanged_document() {
        let md = "# Spec\n\n## Goals\n\nBusiness users review Markdown.";
        let anchor = anchor_for_selection(md, "Business users").unwrap();

        let result = reattach_anchor(md, &anchor);

        assert_eq!(result.status, AnchorReattachStatus::Attached);
        assert_eq!(result.anchor.unwrap().start_line, 5);
    }

    #[test]
    fn reattaches_relocated_anchor_after_lines_shift() {
        let original = "# Spec\n\n## Goals\n\nBusiness users review Markdown.";
        let updated = "# Spec\n\nIntro paragraph.\n\n## Goals\n\nBusiness users review Markdown.";
        let anchor = anchor_for_selection(original, "Business users").unwrap();

        let result = reattach_anchor(updated, &anchor);

        assert_eq!(result.status, AnchorReattachStatus::Relocated);
        assert_eq!(result.anchor.unwrap().start_line, 7);
    }

    #[test]
    fn disambiguates_repeated_quote_with_heading_context() {
        let original = "# Spec\n\n## Goals\n\nReview this.\n\n## Non-goals\n\nReview this.";
        let updated = "# Spec\n\n## Goals\n\nReview this.\n\n## Non-goals\n\nReview this.";
        let anchor = anchor_for_selection(original, "Review this.").unwrap();

        let result = reattach_anchor(updated, &anchor);

        assert_eq!(result.status, AnchorReattachStatus::Attached);
        assert_eq!(result.anchor.unwrap().heading_path, vec!["Spec", "Goals"]);
    }

    #[test]
    fn marks_contextless_repeated_quote_as_needs_reattachment() {
        let mut anchor = anchor_for_selection("Review this.", "Review this.").unwrap();
        anchor.prefix.clear();
        anchor.suffix.clear();
        anchor.heading_path.clear();
        let updated = "Review this.\n\nReview this.\n\nReview this.";

        let result = reattach_anchor(updated, &anchor);

        assert_eq!(result.status, AnchorReattachStatus::NeedsReattachment);
        assert!(result.anchor.is_none());
        assert!(result.candidates.len() >= 2);
    }

    #[test]
    fn reports_missing_when_quote_cannot_be_found() {
        let original = "# Spec\n\nBusiness users review Markdown.";
        let updated = "# Spec\n\nEngineers review Markdown.";
        let anchor = anchor_for_selection(original, "Business users").unwrap();

        let result = reattach_anchor(updated, &anchor);

        assert_eq!(result.status, AnchorReattachStatus::Missing);
        assert!(result.anchor.is_none());
    }

    #[test]
    fn anchor_context_handles_unicode_boundaries() {
        let md = "🙂 ".repeat(80) + "Business users review Markdown.";
        let anchor = anchor_for_selection(&md, "Business users").unwrap();

        assert!(anchor.prefix.ends_with("🙂 "));
        assert_eq!(
            reattach_anchor(&md, &anchor).status,
            AnchorReattachStatus::Attached
        );
    }

    proptest! {
        #[test]
        fn reattaches_after_random_lines_are_inserted_before_anchor(
            before in prop::collection::vec(line_text(), 0..10),
            after in prop::collection::vec(line_text(), 0..10),
            inserted in prop::collection::vec(line_text(), 1..10)
        ) {
            let quote = "TARGET ANCHOR LINE";
            let mut original_lines = before.clone();
            original_lines.push(quote.to_owned());
            original_lines.extend(after);
            let original = original_lines.join("\n");
            let anchor = anchor_for_selection(&original, quote).unwrap();

            let mut updated_lines = inserted.clone();
            updated_lines.extend(original_lines);
            let updated = updated_lines.join("\n");
            let result = reattach_anchor(&updated, &anchor);
            let reattached = result.anchor.expect("anchor should reattach");

            prop_assert_eq!(result.status, AnchorReattachStatus::Relocated);
            prop_assert_eq!(reattached.quote, quote);
            prop_assert_eq!(reattached.start_line, anchor.start_line + inserted.len());
        }
    }

    fn line_text() -> impl Strategy<Value = String> {
        prop::collection::vec(
            prop_oneof![
                Just("alpha"),
                Just("beta"),
                Just("gamma"),
                Just("margin"),
                Just("review"),
                Just("anchor"),
                Just("context"),
                Just("markdown"),
            ],
            1..6,
        )
        .prop_map(|words| words.join(" "))
    }
}
