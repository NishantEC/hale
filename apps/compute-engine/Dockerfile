FROM rust:1.85-slim AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --bin noop-compute-engine

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /app/target/release/noop-compute-engine /app
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/app"]
