//! One-shot encoder for the square peg. Request JSON on stdin. Result JSON on stdout.
//! A secret in the request is not written back.

use serde::Deserialize;
use serde_json::json;
use silverscript_abi::{encode_contract_entry_sig_script, ArtifactValue};
use square_peg::{birth_sign, bytecode, compile_opening, xonly, Opening};

#[derive(Deserialize)]
struct Job {
    op: String,
    secret: Option<String>,
    issuer: Option<String>,
    reserve: Option<String>,
    owner: Option<String>,
    #[serde(rename = "openSig")]
    open_sig: Option<String>,
    sig: Option<String>,
    #[serde(rename = "nextOwner")]
    next_owner: Option<String>,
    entry: Option<String>,
    cents: Option<i64>,
    sompi: Option<i64>,
    #[serde(rename = "quoteMicro")]
    quote_micro: Option<i64>,
    rail: Option<u8>,
    frozen: Option<u8>,
    #[serde(rename = "bornCents")]
    born_cents: Option<i64>,
    #[serde(rename = "bornSompi")]
    born_sompi: Option<i64>,
    take: Option<i64>,
}

fn hex_bytes(label: &str, text: &str) -> Result<Vec<u8>, String> {
    let clean = text.trim().trim_start_matches("0x");
    if clean.len() % 2 != 0 || !clean.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err(format!("The {label} is not hex."));
    }
    (0..clean.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&clean[i..i + 2], 16).map_err(|_| format!("The {label} is not hex.")))
        .collect()
}

fn need<'a>(value: &'a Option<String>, label: &str) -> Result<&'a str, String> {
    value.as_deref().map(str::trim).filter(|text| !text.is_empty()).ok_or_else(|| format!("Missing {label}."))
}

fn opening_from(job: &Job) -> Result<Opening, String> {
    Ok(Opening {
        issuer: hex_bytes("issuer", need(&job.issuer, "issuer")?)?,
        reserve: hex_bytes("reserve", need(&job.reserve, "reserve")?)?,
        cents: job.cents.ok_or("Missing cents.")?,
        owner: hex_bytes("owner", need(&job.owner, "owner")?)?,
        rail: job.rail.ok_or("Missing rail.")?,
        frozen: job.frozen.unwrap_or(0),
        quote_micro: job.quote_micro.ok_or("Missing quote.")?,
        born_cents: job.born_cents.ok_or("Missing born cents.")?,
        born_sompi: job.born_sompi.ok_or("Missing born sompi.")?,
        open_sig: hex_bytes("opening signature", need(&job.open_sig, "opening signature")?)?,
    })
}

fn call_args(job: &Job, entry: &str) -> Result<Vec<ArtifactValue>, String> {
    let sig = hex_bytes("signature", need(&job.sig, "signature")?)?;
    let take = job.take.unwrap_or(0);
    match entry {
        "redeem" | "exchange" | "spend" => Ok(vec![ArtifactValue::Bytes(sig), ArtifactValue::Int(take)]),
        "recover" | "freeze" => Ok(vec![ArtifactValue::Bytes(sig)]),
        "transfer" => Ok(vec![
            ArtifactValue::Bytes(sig),
            ArtifactValue::Bytes(hex_bytes("next owner", need(&job.next_owner, "next owner")?)?),
            ArtifactValue::Int(take),
        ]),
        _ => Err("That peg entry is not on this contract.".to_string()),
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn main() {
    let mut raw = String::new();
    if std::io::Read::read_to_string(&mut std::io::stdin(), &mut raw).is_err() {
        eprintln!("The peg encoder could not read its request.");
        std::process::exit(1);
    }
    let job: Job = match serde_json::from_str(&raw) {
        Ok(job) => job,
        Err(_) => {
            eprintln!("The peg encoder could not read its request.");
            std::process::exit(1);
        }
    };
    let result = match job.op.as_str() {
        "birth" => birth(&job),
        "script" => script(&job),
        "encode" => encode(&job),
        _ => Err("The peg encoder does not know that request.".to_string()),
    };
    match result {
        Ok(value) => println!("{value}"),
        Err(err) => {
            let text = err.to_lowercase();
            if text.contains("secret") || text.contains("private") {
                eprintln!("The peg encoder stopped.");
            } else {
                eprintln!("{err}");
            }
            std::process::exit(1);
        }
    }
}

fn birth(job: &Job) -> Result<serde_json::Value, String> {
    let secret = hex_bytes("issuer key", need(&job.secret, "issuer key")?)?;
    let cents = job.cents.ok_or("Missing cents.")?;
    let sompi = job.sompi.ok_or("Missing sompi.")?;
    let quote = job.quote_micro.ok_or("Missing quote.")?;
    let sig = birth_sign(&secret, cents, sompi, quote);
    let pubkey = xonly(&secret);
    Ok(json!({ "pubkey": hex(&pubkey), "sig": hex(&sig) }))
}

fn locking(code: &[u8]) -> (String, u16) {
    let spk = kaspa_txscript::pay_to_script_hash_script(code);
    (spk.script_as_hex(), spk.version())
}

fn script(job: &Job) -> Result<serde_json::Value, String> {
    let opening = opening_from(job)?;
    let artifact = compile_opening(&opening)?;
    let code = bytecode(&artifact);
    let (script, version) = locking(&code);
    Ok(json!({ "bytecode": hex(&code), "script": script, "version": version }))
}

fn encode(job: &Job) -> Result<serde_json::Value, String> {
    let opening = opening_from(job)?;
    let artifact = compile_opening(&opening)?;
    let entry = job.entry.as_deref().unwrap_or("");
    let args = call_args(job, entry)?;
    let witness = encode_contract_entry_sig_script(&artifact, "SquarePeg", entry, &args).map_err(|err| err.to_string())?;
    let flags = kaspa_txscript::EngineFlags { covenants_enabled: true, ..Default::default() };
    let full = kaspa_txscript::pay_to_script_hash_signature_script_with_flags(bytecode(&artifact), witness.clone(), flags)
        .map_err(|err| err.to_string())?;
    Ok(json!({
        "bytecode": hex(&bytecode(&artifact)),
        "witness": hex(&witness),
        "sigscript": hex(&full),
    }))
}
