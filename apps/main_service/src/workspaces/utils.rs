use std::collections::HashSet;

use error_handlers::ErrorCode;

pub const MAX_WORKSPACE_NAME_LENGTH: u64 = 64;

pub const MIN_WORKSPACE_SLUG_LENGTH: u64 = 3;
pub const MAX_WORKSPACE_SLUG_LENGTH: u64 = 32;

pub const MAX_TASK_PREFIX_LENGTH: usize = 5;
pub const MIN_TASK_PREFIX_LENGTH: usize = 2;

/// A slug made from a name stays this short, so that `-2` … `-999` still fit the limit.
const GENERATED_SLUG_LENGTH: usize = MAX_WORKSPACE_SLUG_LENGTH as usize - 4;

/// For a name with nothing to make a slug or a prefix of (`"!!"`, emoji).
const FALLBACK_SLUG: &str = "workspace";
const FALLBACK_TASK_PREFIX: &str = "WS";

pub fn validate_workspace_name(name: &str) -> Result<(), ErrorCode> {
    if name.is_empty() {
        return Err(ErrorCode::Required);
    }

    if name.chars().count() > MAX_WORKSPACE_NAME_LENGTH as usize {
        return Err(ErrorCode::ValueTooLong {
            max: MAX_WORKSPACE_NAME_LENGTH,
        });
    }

    Ok(())
}

/// 3–32 of `[a-z0-9-]`, not starting or ending with `-` (access spec §1.1).
pub fn validate_workspace_slug(slug: &str) -> Result<(), ErrorCode> {
    if slug.is_empty() {
        return Err(ErrorCode::Required);
    }

    let length = slug.chars().count();

    if length > MAX_WORKSPACE_SLUG_LENGTH as usize {
        return Err(ErrorCode::ValueTooLong {
            max: MAX_WORKSPACE_SLUG_LENGTH,
        });
    }

    if length < MIN_WORKSPACE_SLUG_LENGTH as usize {
        return Err(ErrorCode::ValueTooShort {
            min: MIN_WORKSPACE_SLUG_LENGTH,
        });
    }

    let allowed = slug
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');

    if !allowed || slug.starts_with('-') || slug.ends_with('-') {
        return Err(ErrorCode::InvalidFormat);
    }

    Ok(())
}

/// 2–5 of `[A-Z]` (access spec §1.1).
pub fn validate_task_prefix(prefix: &str) -> Result<(), ErrorCode> {
    if prefix.is_empty() {
        return Err(ErrorCode::Required);
    }

    let length = prefix.chars().count();

    if length > MAX_TASK_PREFIX_LENGTH {
        return Err(ErrorCode::ValueTooLong {
            max: MAX_TASK_PREFIX_LENGTH as u64,
        });
    }

    if length < MIN_TASK_PREFIX_LENGTH {
        return Err(ErrorCode::ValueTooShort {
            min: MIN_TASK_PREFIX_LENGTH as u64,
        });
    }

    if prefix.chars().any(|c| !c.is_ascii_uppercase()) {
        return Err(ErrorCode::InvalidFormat);
    }

    Ok(())
}

/// `Verso team` → `verso-team`, `Проект` → `proekt`. Always a valid slug, short enough for a
/// numeric suffix: a name too short gets `-workspace`, a name without letters or digits becomes
/// `workspace`.
pub fn name_to_slug(name: &str) -> String {
    let ascii = deunicode::deunicode(name);
    let mut slug = String::new();

    for c in ascii.to_ascii_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
        } else if !slug.is_empty() && !slug.ends_with('-') {
            slug.push('-');
        }
    }

    slug.truncate(GENERATED_SLUG_LENGTH);
    let slug = slug.trim_end_matches('-');

    if slug.is_empty() {
        FALLBACK_SLUG.to_owned()
    } else if slug.len() < MIN_WORKSPACE_SLUG_LENGTH as usize {
        format!("{slug}-{FALLBACK_SLUG}")
    } else {
        slug.to_owned()
    }
}

/// `base`, or `base-2`, `base-3`… — the first one not in `existing`.
pub fn find_available_slug(base: &str, existing: &[String]) -> String {
    let existing: HashSet<&str> = existing.iter().map(String::as_str).collect();

    if !existing.contains(base) {
        return base.to_owned();
    }

    (2_u64..)
        .map(|suffix| format!("{base}-{suffix}"))
        .find(|candidate| !existing.contains(candidate.as_str()))
        .expect("an unbounded range always has a free suffix")
}

/// `Verso team` → `VT`, `Verso` → `VE`, `Проект Альфа` → `PA`. The first letters of up to five
/// words; one word gives its first two letters. Always 2–5 of `[A-Z]`.
pub fn name_to_task_prefix(name: &str) -> String {
    let ascii = deunicode::deunicode(name);
    let words: Vec<String> = ascii
        .split(|c: char| c.is_whitespace() || matches!(c, '-' | '_' | '.' | '/'))
        .map(|word| {
            word.chars()
                .filter(char::is_ascii_alphabetic)
                .collect::<String>()
        })
        .filter(|word| !word.is_empty())
        .collect();

    let initials: String = words
        .iter()
        .take(MAX_TASK_PREFIX_LENGTH)
        .filter_map(|word| word.chars().next())
        .collect();

    let prefix = if initials.len() >= MIN_TASK_PREFIX_LENGTH {
        initials
    } else {
        words
            .concat()
            .chars()
            .take(MIN_TASK_PREFIX_LENGTH)
            .collect()
    };

    if prefix.len() < MIN_TASK_PREFIX_LENGTH {
        FALLBACK_TASK_PREFIX.to_owned()
    } else {
        prefix.to_ascii_uppercase()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_name_is_1_to_64_characters_not_bytes() {
        assert_eq!(validate_workspace_name(""), Err(ErrorCode::Required));
        assert!(validate_workspace_name("V").is_ok());
        assert!(validate_workspace_name(&"я".repeat(64)).is_ok());
        assert_eq!(
            validate_workspace_name(&"я".repeat(65)),
            Err(ErrorCode::ValueTooLong { max: 64 })
        );
    }

    #[test]
    fn a_slug_is_3_to_32_lowercase_letters_digits_and_inner_hyphens() {
        for slug in ["abc", "verso-team", "team-2", "a-b", &"a".repeat(32)] {
            assert_eq!(validate_workspace_slug(slug), Ok(()), "{slug}");
        }

        assert_eq!(validate_workspace_slug(""), Err(ErrorCode::Required));
        assert_eq!(
            validate_workspace_slug("ab"),
            Err(ErrorCode::ValueTooShort { min: 3 })
        );
        assert_eq!(
            validate_workspace_slug(&"a".repeat(33)),
            Err(ErrorCode::ValueTooLong { max: 32 })
        );
        for slug in ["Verso", "проект", "a_b", "a b", "-abc", "abc-", "---"] {
            assert_eq!(
                validate_workspace_slug(slug),
                Err(ErrorCode::InvalidFormat),
                "{slug}"
            );
        }
    }

    #[test]
    fn a_task_prefix_is_2_to_5_uppercase_letters() {
        assert!(validate_task_prefix("TM").is_ok());
        assert!(validate_task_prefix("ABCDE").is_ok());
        assert_eq!(validate_task_prefix(""), Err(ErrorCode::Required));
        assert_eq!(
            validate_task_prefix("T"),
            Err(ErrorCode::ValueTooShort { min: 2 })
        );
        assert_eq!(
            validate_task_prefix("ABCDEF"),
            Err(ErrorCode::ValueTooLong { max: 5 })
        );
        for prefix in ["tm", "T1", "ПА", "T-M"] {
            assert_eq!(
                validate_task_prefix(prefix),
                Err(ErrorCode::InvalidFormat),
                "{prefix}"
            );
        }
    }

    #[test]
    fn a_slug_is_made_from_the_name() {
        assert_eq!(name_to_slug("Verso team"), "verso-team");
        assert_eq!(name_to_slug("  Verso   team!! "), "verso-team");
        assert_eq!(name_to_slug("Проект Альфа"), "proekt-al-fa");
        assert_eq!(name_to_slug("Team 42"), "team-42");
    }

    #[test]
    fn a_made_slug_is_always_valid_and_leaves_room_for_a_suffix() {
        assert_eq!(name_to_slug("!!"), "workspace");
        assert_eq!(name_to_slug("🚀"), "rocket");
        assert_eq!(name_to_slug("AB"), "ab-workspace");
        assert_eq!(name_to_slug("X"), "x-workspace");

        let long = name_to_slug(&"word ".repeat(20));
        assert!(long.len() <= GENERATED_SLUG_LENGTH, "{long}");
        assert!(!long.ends_with('-'), "{long}");

        for name in [
            "!!",
            "AB",
            "Проект",
            &"word ".repeat(20),
            "a-b-c-d-e-f-g-h-i-j-k-l-m-n",
        ] {
            let slug = name_to_slug(name);
            assert_eq!(validate_workspace_slug(&slug), Ok(()), "{name} → {slug}");
            let suffixed = format!("{slug}-999");
            assert_eq!(validate_workspace_slug(&suffixed), Ok(()), "{suffixed}");
        }
    }

    #[test]
    fn the_first_free_suffix_is_taken() {
        let taken = |slugs: &[&str]| slugs.iter().map(|s| s.to_string()).collect::<Vec<_>>();

        assert_eq!(find_available_slug("verso", &[]), "verso");
        assert_eq!(find_available_slug("verso", &taken(&["verso"])), "verso-2");
        assert_eq!(
            find_available_slug("verso", &taken(&["verso", "verso-2", "verso-4"])),
            "verso-3"
        );
    }

    #[test]
    fn a_task_prefix_is_made_from_the_name() {
        assert_eq!(name_to_task_prefix("Verso team"), "VT");
        assert_eq!(name_to_task_prefix("Verso"), "VE");
        assert_eq!(name_to_task_prefix("Проект Альфа"), "PA");
        assert_eq!(name_to_task_prefix("a b c d e f g"), "ABCDE");
        assert_eq!(name_to_task_prefix("design-system team"), "DST");
        assert_eq!(name_to_task_prefix("42 Team"), "TE");
    }

    #[test]
    fn a_made_task_prefix_is_always_valid() {
        for name in ["X", "!!", "42", "🚀", "a1", "Verso", "Проект Альфа", "x y"] {
            let prefix = name_to_task_prefix(name);
            assert_eq!(validate_task_prefix(&prefix), Ok(()), "{name} → {prefix}");
        }
        assert_eq!(name_to_task_prefix("X"), "WS");
        assert_eq!(name_to_task_prefix("42"), "WS");
    }
}
