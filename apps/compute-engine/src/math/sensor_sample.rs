use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy)]
pub struct SensorSample {
    pub timestamp: DateTime<Utc>,
    pub spo2_red: f64,
    pub spo2_ir: f64,
    pub skin_temp_raw: f64,
}
