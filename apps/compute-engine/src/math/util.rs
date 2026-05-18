pub fn average(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let sum: f64 = values.iter().sum();
    sum / (values.len() as f64)
}

pub fn std_dev(values: &[f64]) -> f64 {
    if values.len() < 2 {
        return 0.0;
    }
    let mean = average(values);
    let n = values.len() as f64;
    let sq: f64 = values.iter().map(|v| (v - mean).powi(2)).sum();
    (sq / n).sqrt()
}

pub fn clamp(value: f64, lo: f64, hi: f64) -> f64 {
    value.max(lo).min(hi)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn average_empty_is_zero() {
        assert_eq!(average(&[]), 0.0);
    }

    #[test]
    fn average_basic() {
        assert!((average(&[1.0, 2.0, 3.0]) - 2.0).abs() < 1e-12);
    }

    #[test]
    fn std_dev_population() {
        let v = [1.0, 2.0, 3.0];
        assert!((std_dev(&v) - (2.0_f64 / 3.0).sqrt()).abs() < 1e-12);
    }

    #[test]
    fn std_dev_under_two_is_zero() {
        assert_eq!(std_dev(&[]), 0.0);
        assert_eq!(std_dev(&[7.0]), 0.0);
    }

    #[test]
    fn clamp_basic() {
        assert_eq!(clamp(5.0, 0.0, 3.0), 3.0);
        assert_eq!(clamp(-1.0, 0.0, 3.0), 0.0);
        assert_eq!(clamp(1.5, 0.0, 3.0), 1.5);
    }
}
