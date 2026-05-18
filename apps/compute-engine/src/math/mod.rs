pub mod timestamp_slice;
pub mod util;

pub use timestamp_slice::{
    average_by_timestamp, slice_by_timestamp, sum_by_timestamp, HasTimestamp, HasValue,
};
pub use util::{average, clamp, std_dev};
