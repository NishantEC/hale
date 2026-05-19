pub mod sensor_sample;
pub mod skin_temp;
pub mod spo2;
pub mod stress;
pub mod timestamp_slice;
pub mod util;

pub use timestamp_slice::{
    average_by_timestamp, slice_by_timestamp, sum_by_timestamp, HasTimestamp, HasValue,
};
pub use util::{average, clamp, std_dev};

use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy)]
pub struct TimestampedValue {
    pub timestamp: DateTime<Utc>,
    pub value: f64,
}
