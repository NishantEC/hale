pub mod activity;
pub mod core_temperature;
pub mod hrv;
pub mod recovery_index;
pub mod sensor_sample;
pub mod skin_temp;
pub mod sleep_consistency;
pub mod sleep_detect;
pub mod spo2;
pub mod spo2_events;
pub mod strain;
pub mod stress;
pub mod timestamp_slice;
pub mod training_load;
pub mod util;

pub use timestamp_slice::{
    HasTimestamp, HasValue, average_by_timestamp, slice_by_timestamp, sum_by_timestamp,
};
pub use util::{average, clamp, std_dev};

use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy)]
pub struct TimestampedValue {
    pub timestamp: DateTime<Utc>,
    pub value: f64,
}
