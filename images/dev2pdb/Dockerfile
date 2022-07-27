FROM --platform=$BUILDPLATFORM golang:1.18 as builder

ARG TARGETARCH

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
RUN GOOS=linux GOARCH=$TARGETARCH go build -a -o /app/output/dev2pdb ./...

FROM gcr.io/distroless/base-debian10
WORKDIR /
COPY --from=builder /app/output/dev2pdb /dev2pdb
ENTRYPOINT ["/dev2pdb"]