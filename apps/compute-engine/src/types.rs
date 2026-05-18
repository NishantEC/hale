use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignalSampleV1 {
    pub timestamp: DateTime<Utc>,
    pub source: String,
    pub heart_rate: f64,
    pub ibi_ms: Option<f64>,
    pub motion_score: Option<f64>,
    pub quality_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoricalSensorRecordV1 {
    pub timestamp: DateTime<Utc>,
    pub heart_rate: f64,
    pub rr_average_ms: Option<f64>,
    pub spo2_red: Option<f64>,
    #[serde(rename = "spo2IR")]
    pub spo2_ir: Option<f64>,
    pub skin_temp_raw: Option<f64>,
    pub gravity_magnitude: Option<f64>,
    pub gravity_x: Option<f64>,
    pub gravity_y: Option<f64>,
    pub gravity_z: Option<f64>,
    pub resp_rate_raw: Option<f64>,
    pub skin_contact: Option<bool>,
    pub ppg_green: Option<f64>,
    pub ppg_red_ir: Option<f64>,
    pub ambient_light: Option<f64>,
    pub led_drive1: Option<f64>,
    pub led_drive2: Option<f64>,
    pub signal_quality: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NightFeatureSetV1 {
    pub night_date: DateTime<Utc>,
    pub resting_heart_rate: f64,
    pub rmssd: f64,
    pub sdnn: f64,
    pub pnn50: f64,
    pub respiratory_rate: f64,
    pub continuity: f64,
    pub regularity: f64,
    pub valid_coverage: f64,
    pub confidence_raw: f64,
    pub sleep_estimate_hours: f64,
    pub source_blend: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SleepDetectionSummaryV1 {
    pub night_date: DateTime<Utc>,
    pub bedtime: DateTime<Utc>,
    pub wake_time: DateTime<Utc>,
    pub duration_hours: f64,
    pub interruption_count: f64,
    pub continuity: f64,
    pub regularity: f64,
    pub valid_coverage: f64,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaselineProfileV1 {
    pub resting_heart_rate: f64,
    pub rmssd: f64,
    pub sdnn: f64,
    pub nights_used: f64,
    pub is_warmed_up: bool,
    pub max_heart_rate: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComputeDerivedMetricsDayRequestV1 {
    pub schema_version: u32,
    pub samples: Vec<SignalSampleV1>,
    pub sensor_records: Vec<HistoricalSensorRecordV1>,
    pub night_features: Vec<NightFeatureSetV1>,
    pub sleep_detections: Vec<SleepDetectionSummaryV1>,
    pub baseline: BaselineProfileV1,
    pub reference_date: String,
    pub time_zone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedDailyMetricV1 {
    pub schema_version: u32,
    pub strain_score: Option<f64>,
    pub sleep_consistency_score: Option<f64>,
    pub detected_sleep_nights: f64,
    pub skin_temp_avg_celsius: Option<f64>,
    pub skin_temp_delta_celsius: Option<f64>,
    pub stress_average: Option<f64>,
    pub spo2_average: Option<f64>,
    pub lf_hf_ratio_average: Option<f64>,
    pub recovery_index: Option<f64>,
    pub training_load_ratio: Option<f64>,
    pub training_load_risk_zone: Option<String>,
    pub spo2_dip_count: Option<f64>,
    pub odi_per_hour: Option<f64>,
    pub lowest_spo2: Option<f64>,
    pub core_temperature_estimate: Option<f64>,
    pub circadian_nadir: Option<DateTime<Utc>>,
    pub sleep_architecture_score: Option<f64>,
}
