use noop_compute_engine::build_app;
use std::net::SocketAddr;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().json().with_target(false).init();
    let port: u16 = std::env::var("PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!(%addr, "compute-engine listening");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, build_app()).await?;
    Ok(())
}
