FROM golang:1.18

WORKDIR /usr/src/app
COPY go.mod go.sum ./
RUN go mod download && go mod verify

COPY . .
RUN go build -v -o /usr/local/bin/dev2pdb ./...

CMD ["dev2pdb"]