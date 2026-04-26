pub mod anchor;
pub mod patch;
pub mod sidecar;

pub use anchor::{
    anchor_for_selection, heading_path_before, reattach_anchor, Anchor, AnchorCandidate,
    AnchorReattachStatus, AnchorReattachment,
};
pub use patch::{apply_replacements, Replacement};
pub use sidecar::{render_sidecar_yaml, PublishedReview, SidecarComment, SidecarSuggestion};
