use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Replacement {
    pub original: String,
    pub replacement: String,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PatchError {
    #[error("original text was not found: {0}")]
    MissingOriginal(String),
    #[error("original text appears more than once and needs a stronger anchor: {0}")]
    AmbiguousOriginal(String),
}

pub fn apply_replacements(
    markdown: &str,
    replacements: &[Replacement],
) -> Result<String, PatchError> {
    let mut output = markdown.to_owned();
    for replacement in replacements {
        let matches = output.match_indices(&replacement.original).count();
        match matches {
            0 => return Err(PatchError::MissingOriginal(replacement.original.clone())),
            1 => output = output.replacen(&replacement.original, &replacement.replacement, 1),
            _ => return Err(PatchError::AmbiguousOriginal(replacement.original.clone())),
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applies_single_replacement() {
        let result = apply_replacements(
            "Hello old text.",
            &[Replacement {
                original: "old".into(),
                replacement: "new".into(),
            }],
        )
        .unwrap();

        assert_eq!(result, "Hello new text.");
    }
}
