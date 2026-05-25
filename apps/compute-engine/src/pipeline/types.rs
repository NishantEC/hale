use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StageName {
    SleepDetect,
    ActivityDetect,
    SleepStages,
    NightFeatures,
    DailyScores,
    DailyMetrics,
    Baseline,
}

impl StageName {
    pub fn as_str(&self) -> &'static str {
        match self {
            StageName::SleepDetect => "sleep_detect",
            StageName::ActivityDetect => "activity_detect",
            StageName::SleepStages => "sleep_stages",
            StageName::NightFeatures => "night_features",
            StageName::DailyScores => "daily_scores",
            StageName::DailyMetrics => "daily_metrics",
            StageName::Baseline => "baseline",
        }
    }
}

impl fmt::Display for StageName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StageStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
}

impl StageStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            StageStatus::Pending => "pending",
            StageStatus::Running => "running",
            StageStatus::Succeeded => "succeeded",
            StageStatus::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct DateWindow {
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy)]
pub struct DirtyDay {
    pub day_date: NaiveDate,
    pub raw_max_updated_at: DateTime<Utc>,
}

pub struct StageInput<'a> {
    pub user_id: &'a str,
    pub time_zone: &'a str,
    pub day: NaiveDate,
    pub context: &'a crate::pipeline::context::DayContext,
}

#[derive(Debug, Default, Serialize)]
pub struct StageOutcome {
    pub rows_written: u64,
    pub stats: serde_json::Value,
}
