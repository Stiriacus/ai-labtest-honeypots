FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /meridian .

FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=build /meridian /app/meridian
EXPOSE 8080
ENTRYPOINT ["/app/meridian"]
