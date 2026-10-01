use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct JwkSet {
    pub keys: Vec<Jwk>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Jwk {
    pub kid: String,
    pub kty: String,
    pub alg: String,
    pub n: String,
    pub e: String,
}
