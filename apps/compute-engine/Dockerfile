FROM rust:1.85-slim AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
# Cargo manifest declares [[bench]] which requires the file to exist on disk
# (validated even when not building it). Copy benches/ for that reason —
# `cargo build --bin` won't compile the bench code.
COPY benches ./benches
RUN cargo build --release --bin noop-compute-engine

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /app/target/release/noop-compute-engine /app
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app"]
