use kaspa_consensus_core::hashing::sighash::{calc_schnorr_signature_hash, SigHashReusedValuesUnsync};
use kaspa_consensus_core::hashing::sighash_type::SIG_HASH_ALL;
use kaspa_consensus_core::mass::units::SigopCount;
use kaspa_consensus_core::tx::{
    MutableTransaction, ScriptPublicKey, Transaction, TransactionId, TransactionInput, TransactionOutpoint, TransactionOutput,
    UtxoEntry, VerifiableTransaction,
};
use kaspa_txscript::caches::Cache;
use kaspa_txscript::opcodes::codes::{OpCheckSig, OpData32};
use kaspa_txscript::script_builder::ScriptBuilder;
use kaspa_txscript::{pay_to_script_hash_script, pay_to_script_hash_signature_script_with_flags, EngineCtx, EngineFlags, TxScriptEngine};
use secp256k1::{Keypair, Message, Secp256k1, SecretKey};
use silverscript_abi::{encode_contract_entry_sig_script, ArtifactValue};
use square_peg::{birth_digest, birth_message, birth_sign, bytecode, compile_opening, Opening, KUSDT, POC};

const ISSUER: [u8; 32] = [3u8; 32];
const RESERVE: [u8; 32] = [4u8; 32];
const OWNER: [u8; 32] = [7u8; 32];
const OTHER: [u8; 32] = [9u8; 32];
const QUOTE: i64 = 50_000;
const CENTS: i64 = 100;
const SOMPI: u64 = 1_000;
const FEE: u64 = 1_000_000;

fn key(secret: [u8; 32]) -> Keypair {
    let secp = Secp256k1::new();
    Keypair::from_secret_key(&secp, &SecretKey::from_slice(&secret).expect("test key"))
}

fn xonly(secret: [u8; 32]) -> Vec<u8> {
    key(secret).x_only_public_key().0.serialize().to_vec()
}

fn p2pk(pubkey: &[u8]) -> Vec<u8> {
    ScriptBuilder::new().add_data(pubkey).unwrap().add_op(OpCheckSig).unwrap().drain()
}

#[derive(Clone)]
struct Lock {
    cents: i64,
    owner: [u8; 32],
    rail: u8,
    frozen: u8,
    sompi: u64,
    open_sig: Vec<u8>,
}

impl Lock {
    fn fair() -> Self {
        Self {
            cents: CENTS,
            owner: OWNER,
            rail: POC,
            frozen: 0,
            sompi: SOMPI,
            open_sig: birth_sign(&ISSUER, CENTS, SOMPI as i64, QUOTE).to_vec(),
        }
    }

    fn opening(&self) -> Opening {
        Opening {
            issuer: xonly(ISSUER),
            reserve: xonly(RESERVE),
            cents: self.cents,
            owner: xonly(self.owner),
            rail: self.rail,
            frozen: self.frozen,
            quote_micro: QUOTE,
            born_cents: CENTS,
            born_sompi: SOMPI as i64,
            open_sig: self.open_sig.clone(),
        }
    }
}

fn flags() -> EngineFlags {
    EngineFlags { covenants_enabled: true, ..Default::default() }
}

struct Built {
    tx: MutableTransaction<Transaction>,
    utxo: UtxoEntry,
    reused: SigHashReusedValuesUnsync,
    artifact: silverscript_abi::SilAbiArtifact,
}

fn build(lock: &Lock, outputs: Vec<TransactionOutput>, extra_inputs: usize) -> Built {
    let artifact = compile_opening(&lock.opening()).expect("compile");
    let redeem = bytecode(&artifact);
    let spk = pay_to_script_hash_script(&redeem);
    let reused = SigHashReusedValuesUnsync::new();
    let mut inputs = vec![TransactionInput {
        previous_outpoint: TransactionOutpoint { transaction_id: TransactionId::from_bytes([1u8; 32]), index: 0 },
        signature_script: vec![],
        sequence: 0,
        compute_commit: SigopCount(1).into(),
    }];
    let mut utxos = vec![UtxoEntry::new(lock.sompi, spk.clone(), 0, false, None)];
    for n in 0..extra_inputs {
        inputs.push(TransactionInput {
            previous_outpoint: TransactionOutpoint { transaction_id: TransactionId::from_bytes([2u8 + n as u8; 32]), index: 0 },
            signature_script: vec![],
            sequence: 0,
            compute_commit: SigopCount(1).into(),
        });
        utxos.push(UtxoEntry::new(FEE, ScriptPublicKey::new(0, vec![OpData32].into()), 0, false, None));
    }
    let tx = Transaction::new(0, inputs, outputs, 0, Default::default(), 0, vec![]);
    let tx = MutableTransaction::with_entries(tx, utxos.clone());
    Built { tx, utxo: utxos.remove(0), reused, artifact }
}

fn sign(built: &Built, secret: [u8; 32]) -> Vec<u8> {
    let sig_hash = calc_schnorr_signature_hash(&built.tx.as_verifiable(), 0, SIG_HASH_ALL, &built.reused);
    let message = Message::from_digest_slice(sig_hash.as_bytes().as_slice()).expect("digest");
    let sig = key(secret).sign_schnorr(message);
    let mut signature = Vec::with_capacity(65);
    signature.extend_from_slice(sig.as_ref());
    signature.push(SIG_HASH_ALL.to_u8());
    signature
}

fn execute(mut built: Built, entry: &str, args: Vec<ArtifactValue>) -> Result<(), kaspa_txscript_errors::TxScriptError> {
    let witness = encode_contract_entry_sig_script(&built.artifact, "SquarePeg", entry, &args).expect("witness");
    let sigscript = pay_to_script_hash_signature_script_with_flags(bytecode(&built.artifact), witness, flags()).expect("sigscript");
    built.tx.tx.inputs[0].signature_script = sigscript;
    let cache = Cache::new(10_000);
    let verifiable = built.tx.as_verifiable();
    let mut vm = TxScriptEngine::from_transaction_input(
        &verifiable,
        &verifiable.inputs()[0],
        0,
        &built.utxo,
        EngineCtx::new(&cache).with_reused(&built.reused),
        flags(),
    );
    vm.execute()
}

fn p2pk_out(secret: [u8; 32], value: u64) -> TransactionOutput {
    TransactionOutput { value, script_public_key: ScriptPublicKey::new(0, p2pk(&xonly(secret)).into()), covenant: None }
}

fn cont(lock: &Lock, cents: i64, owner: [u8; 32], rail: u8, frozen: u8, value: u64) -> TransactionOutput {
    let mut next = lock.clone();
    next.cents = cents;
    next.owner = owner;
    next.rail = rail;
    next.frozen = frozen;
    let artifact = compile_opening(&next.opening()).expect("continuation");
    TransactionOutput { value, script_public_key: pay_to_script_hash_script(&bytecode(&artifact)), covenant: None }
}

fn redeem_args(sig: Vec<u8>, take: i64) -> Vec<ArtifactValue> {
    vec![ArtifactValue::Bytes(sig), ArtifactValue::Int(take)]
}

#[test]
fn the_opening_message_is_three_little_endian_ints() {
    let message = birth_message(5, 100_000_000, 50_000);
    assert_eq!(hex::encode_like(&message), "050000000000000000e1f5050000000050c3000000000000");
    assert_eq!(
        hex::encode_like(&birth_digest(5, 100_000_000, 50_000)),
        "6dd17a078af24567a4df6f1a15a4d99a33ba3cf1abd6fddd80b89076b9354bd5"
    );
}

mod hex {
    pub fn encode_like(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }
}

#[test]
fn the_contract_has_the_peg_entries() {
    let names: Vec<_> = {
        let artifact = compile_opening(&Lock::fair().opening()).expect("compile");
        let mut names: Vec<_> = artifact.contracts["SquarePeg"].entries.keys().cloned().collect();
        names.sort();
        names
    };
    assert_eq!(names, vec!["exchange", "freeze", "recover", "redeem", "spend", "transfer"]);
}

#[test]
fn the_holder_redeems_the_full_lock_and_the_fee_stays_on_the_other_input() {
    let lock = Lock::fair();
    let built = build(&lock, vec![p2pk_out(OWNER, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    execute(built, "redeem", redeem_args(sig, CENTS)).expect("full redeem");
}

#[test]
fn a_frozen_kusdt_lock_still_redeems() {
    let mut lock = Lock::fair();
    lock.rail = KUSDT;
    lock.frozen = 1;
    let built = build(&lock, vec![p2pk_out(OWNER, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    execute(built, "redeem", redeem_args(sig, CENTS)).expect("frozen redeem");
}

#[test]
fn a_skimmed_output_fails() {
    let lock = Lock::fair();
    let built = build(&lock, vec![p2pk_out(OWNER, SOMPI - 1)], 1);
    let sig = sign(&built, OWNER);
    assert!(execute(built, "redeem", redeem_args(sig, CENTS)).is_err());
}

#[test]
fn a_different_recipient_fails() {
    let lock = Lock::fair();
    let built = build(&lock, vec![p2pk_out(OTHER, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    assert!(execute(built, "redeem", redeem_args(sig, CENTS)).is_err());
}

#[test]
fn a_different_key_fails() {
    let lock = Lock::fair();
    let built = build(&lock, vec![p2pk_out(OWNER, SOMPI)], 1);
    let sig = sign(&built, OTHER);
    assert!(execute(built, "redeem", redeem_args(sig, CENTS)).is_err());
}

#[test]
fn a_partial_redeem_pays_the_share_and_keeps_the_rest() {
    let lock = Lock::fair();
    let built = build(&lock, vec![p2pk_out(OWNER, 400), cont(&lock, 60, OWNER, POC, 0, 600)], 1);
    let sig = sign(&built, OWNER);
    execute(built, "redeem", redeem_args(sig, 40)).expect("partial redeem");
}

#[test]
fn a_partial_redeem_that_keeps_the_coins_fails() {
    let lock = Lock::fair();
    let built = build(&lock, vec![p2pk_out(OWNER, 400), cont(&lock, 60, OWNER, POC, 0, 601)], 1);
    let sig = sign(&built, OWNER);
    assert!(execute(built, "redeem", redeem_args(sig, 40)).is_err());
}

#[test]
fn a_transfer_moves_the_lock_to_the_next_owner() {
    let lock = Lock::fair();
    let built = build(&lock, vec![cont(&lock, CENTS, OTHER, POC, 0, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    let args = vec![ArtifactValue::Bytes(sig), ArtifactValue::Bytes(xonly(OTHER)), ArtifactValue::Int(CENTS)];
    execute(built, "transfer", args).expect("transfer");
}

#[test]
fn a_frozen_transfer_fails() {
    let mut lock = Lock::fair();
    lock.rail = KUSDT;
    lock.frozen = 1;
    let built = build(&lock, vec![cont(&lock, CENTS, OTHER, KUSDT, 1, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    let args = vec![ArtifactValue::Bytes(sig), ArtifactValue::Bytes(xonly(OTHER)), ArtifactValue::Int(CENTS)];
    assert!(execute(built, "transfer", args).is_err());
}

#[test]
fn an_exchange_flips_the_rail_and_keeps_the_coins() {
    let lock = Lock::fair();
    let built = build(&lock, vec![cont(&lock, CENTS, OWNER, KUSDT, 0, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    execute(built, "exchange", redeem_args(sig, CENTS)).expect("exchange");
}

#[test]
fn an_exchange_that_stays_on_the_same_rail_fails() {
    let lock = Lock::fair();
    let built = build(&lock, vec![cont(&lock, CENTS, OWNER, POC, 0, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    assert!(execute(built, "exchange", redeem_args(sig, CENTS)).is_err());
}

#[test]
fn a_frozen_exchange_fails() {
    let mut lock = Lock::fair();
    lock.rail = KUSDT;
    lock.frozen = 1;
    let built = build(&lock, vec![cont(&lock, CENTS, OWNER, POC, 0, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    assert!(execute(built, "exchange", redeem_args(sig, CENTS)).is_err());
}

#[test]
fn a_shop_spend_pays_the_reserve_and_extinguishes_the_tag() {
    let lock = Lock::fair();
    let built = build(&lock, vec![p2pk_out(RESERVE, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    execute(built, "spend", redeem_args(sig, CENTS)).expect("spend");
}

#[test]
fn a_shop_spend_to_the_holder_fails() {
    let lock = Lock::fair();
    let built = build(&lock, vec![p2pk_out(OWNER, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    assert!(execute(built, "spend", redeem_args(sig, CENTS)).is_err());
}

#[test]
fn a_frozen_shop_spend_fails() {
    let mut lock = Lock::fair();
    lock.rail = KUSDT;
    lock.frozen = 1;
    let built = build(&lock, vec![p2pk_out(RESERVE, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    assert!(execute(built, "spend", redeem_args(sig, CENTS)).is_err());
}

#[test]
fn the_issuer_can_freeze_kusdt_without_moving_the_coins() {
    let mut lock = Lock::fair();
    lock.rail = KUSDT;
    let built = build(&lock, vec![cont(&lock, CENTS, OWNER, KUSDT, 1, SOMPI)], 1);
    let sig = sign(&built, ISSUER);
    execute(built, "freeze", vec![ArtifactValue::Bytes(sig)]).expect("freeze");
}

#[test]
fn poc_has_no_freeze() {
    let lock = Lock::fair();
    let built = build(&lock, vec![cont(&lock, CENTS, OWNER, POC, 1, SOMPI)], 1);
    let sig = sign(&built, ISSUER);
    assert!(execute(built, "freeze", vec![ArtifactValue::Bytes(sig)]).is_err());
}

#[test]
fn the_holder_cannot_freeze() {
    let mut lock = Lock::fair();
    lock.rail = KUSDT;
    let built = build(&lock, vec![cont(&lock, CENTS, OWNER, KUSDT, 1, SOMPI)], 1);
    let sig = sign(&built, OWNER);
    assert!(execute(built, "freeze", vec![ArtifactValue::Bytes(sig)]).is_err());
}

#[test]
fn a_bad_opening_signature_cannot_redeem_and_can_still_return_the_coins() {
    let mut lock = Lock::fair();
    lock.open_sig[0] ^= 0xff;
    let skim = build(&lock, vec![p2pk_out(OWNER, SOMPI - 1)], 1);
    let skim_sig = sign(&skim, OWNER);
    assert!(execute(skim, "recover", vec![ArtifactValue::Bytes(skim_sig)]).is_err());
    let redeem = build(&lock, vec![p2pk_out(OWNER, SOMPI)], 1);
    let redeem_sig = sign(&redeem, OWNER);
    assert!(execute(redeem, "redeem", redeem_args(redeem_sig, CENTS)).is_err());
    let back = build(&lock, vec![p2pk_out(OWNER, SOMPI)], 1);
    let back_sig = sign(&back, OWNER);
    execute(back, "recover", vec![ArtifactValue::Bytes(back_sig)]).expect("recover");
}

#[test]
fn four_inputs_fail_the_three_input_bound() {
    let lock = Lock::fair();
    let built = build(&lock, vec![p2pk_out(OWNER, SOMPI)], 3);
    let sig = sign(&built, OWNER);
    assert!(execute(built, "redeem", redeem_args(sig, CENTS)).is_err());
}
