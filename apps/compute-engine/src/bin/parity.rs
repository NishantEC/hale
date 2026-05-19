use std::io::{self, Read, Write};

use noop_compute_engine::types::ComputeDerivedMetricsDayRequestV1;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let arg = std::env::args()
        .nth(1)
        .ok_or("missing path argument (use - for stdin)")?;
    let input = if arg == "-" {
        let mut buf = String::new();
        io::stdin().read_to_string(&mut buf)?;
        buf
    } else {
        std::fs::read_to_string(&arg)?
    };
    let req: ComputeDerivedMetricsDayRequestV1 = serde_json::from_str(&input)?;
    let out = serde_json::to_string(&req)?;
    let stdout = io::stdout();
    let mut handle = stdout.lock();
    handle.write_all(out.as_bytes())?;
    Ok(())
}
