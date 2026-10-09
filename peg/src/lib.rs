//! Opening message for the square peg. The issuer signs this once.
//! Order is born cents, born sompi, quote. Each one is a little-endian int.

use secp256k1::{Keypair, Message, Secp256k1, SecretKey};
use sha2::{Digest, Sha256};
use silverscript_abi::{ArtifactValue, SilAbiArtifact};
use silverscript_lang::compiler::compile_to_sil_abi_artifact;

pub const POC: u8 = 0;
pub const KUSDT: u8 = 1;

pub fn birth_message(cents: i64, sompi: i64, quote_micro: i64) -> [u8; 24] {
    let mut message = [0u8; 24];
    message[0..8].copy_from_slice(&cents.to_le_bytes());
    message[8..16].copy_from_slice(&sompi.to_le_bytes());
    message[16..24].copy_from_slice(&quote_micro.to_le_bytes());
    message
}

pub fn birth_digest(cents: i64, sompi: i64, quote_micro: i64) -> [u8; 32] {
    Sha256::digest(birth_message(cents, sompi, quote_micro)).into()
}

pub fn birth_sign(secret: &[u8], cents: i64, sompi: i64, quote_micro: i64) -> [u8; 64] {
    let secp = Secp256k1::new();
    let secret = SecretKey::from_slice(secret).expect("issuer key");
    let key = Keypair::from_secret_key(&secp, &secret);
    let message = Message::from_digest_slice(&birth_digest(cents, sompi, quote_micro)).expect("digest");
    let sig = key.sign_schnorr(message);
    *sig.as_ref()
}

pub fn xonly(secret: &[u8]) -> [u8; 32] {
    let secp = Secp256k1::new();
    let secret = SecretKey::from_slice(secret).expect("key");
    let key = Keypair::from_secret_key(&secp, &secret);
    key.x_only_public_key().0.serialize()
}

#[derive(Clone)]
pub struct Opening {
    pub issuer: Vec<u8>,
    pub reserve: Vec<u8>,
    pub cents: i64,
    pub owner: Vec<u8>,
    pub rail: u8,
    pub frozen: u8,
    pub quote_micro: i64,
    pub born_cents: i64,
    pub born_sompi: i64,
    pub open_sig: Vec<u8>,
}

impl Opening {
    pub fn values(&self) -> Vec<ArtifactValue> {
        vec![
            ArtifactValue::Bytes(self.issuer.clone()),
            ArtifactValue::Bytes(self.reserve.clone()),
            ArtifactValue::Int(self.cents),
            ArtifactValue::Bytes(self.owner.clone()),
            ArtifactValue::Byte(self.rail),
            ArtifactValue::Byte(self.frozen),
            ArtifactValue::Int(self.quote_micro),
            ArtifactValue::Int(self.born_cents),
            ArtifactValue::Int(self.born_sompi),
            ArtifactValue::Bytes(self.open_sig.clone()),
        ]
    }
}

pub fn compile_opening(opening: &Opening) -> Result<SilAbiArtifact, String> {
    let source = include_str!("../SquarePeg.sil");
    compile_to_sil_abi_artifact(source, &opening.values()).map_err(|err| err.to_string())
}

pub fn bytecode(artifact: &SilAbiArtifact) -> Vec<u8> {
    artifact.contracts.get("SquarePeg").expect("SquarePeg").compiled.bytecode.clone()
}
