//! A page's address: `/{ws}/p/{short_id}`. 10 characters of base58 (no `0`, `O`, `I`, `l`), random:
//! 58¹⁰ ≈ 4·10¹⁷. Never derived from the id, which would tell when the page was made.

use uuid::Uuid;

const ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

pub const LEN: usize = 10;

/// A new one. The client makes its own (the address is needed before the server answers); the
/// server makes one when the client sent none.
pub fn generate() -> String {
    // 122 random bits, more than the 59 the id takes
    let mut rest = Uuid::new_v4().as_u128();

    (0..LEN)
        .map(|_| {
            let digit = ALPHABET[(rest % 58) as usize] as char;
            rest /= 58;
            digit
        })
        .collect()
}

/// A short id the client made: the right length and alphabet.
pub fn is_valid(short_id: &str) -> bool {
    short_id.len() == LEN && short_id.bytes().all(|byte| ALPHABET.contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_one_is_valid_and_new_ones_differ() {
        let first = generate();

        assert!(is_valid(&first), "{first}");
        assert_ne!(first, generate());
    }

    #[test]
    fn refuses_other_lengths_and_the_letters_base58_leaves_out() {
        assert!(is_valid("4fGh7JkLmN"));
        assert!(!is_valid("4fGh7JkLm"));
        assert!(!is_valid("4fGh7JkLm0"));
        assert!(!is_valid("4fGh7JkLmO"));
        assert!(!is_valid("4fGh7JkLml"));
        assert!(!is_valid("4fGh7JkLm-"));
    }
}
