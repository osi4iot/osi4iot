package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v4/pgxpool"
	"log"
	"os"
	"strings"
	"time"
	"net/http"
	"io"
)

type config struct {
	mqttClientId       string
	mqttPort           int
	mqttBrokerUrl      string
	dev2pdbUsername    string
	dev2pdbPassword    string
	timescaledbUser       string
	timescaledbPassword   string
	timescaledbServiceUrl string
	databaseName       string
}

func connectToMqttBroker(configData config) mqtt.Client {
	opts := createClientOptions(configData)
	client := mqtt.NewClient(opts)
	token := client.Connect()

	for !token.WaitTimeout(3 * time.Second) {
	}

	if err := token.Error(); err != nil {
		log.Fatal(err)
	} else {
		fmt.Printf("Dev2pdb service connected to mqtt broker.\n")
	}
	return client
}

var connectLostHandler mqtt.ConnectionLostHandler = func(client mqtt.Client, err error) {
    fmt.Printf("Connection lost: %v", err)
	os.Exit(1)
}

func createClientOptions(configData config) *mqtt.ClientOptions {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(getMqttBrokerUrl(configData))
	opts.SetClientID(configData.mqttClientId)
	opts.SetUsername(configData.dev2pdbUsername)
	opts.SetPassword(configData.dev2pdbPassword)
	opts.OnConnectionLost = connectLostHandler
	return opts
}

func saveToDatabaseWithTimestampHandler(dbPool *pgxpool.Pool, msg mqtt.Message) {
	sqlQuery := "INSERT INTO iot_data.thingData (group_uid, device_uid, topic_uid, topic, payload, timestamp, deleted) VALUES ($1, $2, $3, $4, $5, $6, $7);"

	topicsSlice := strings.Split(msg.Topic(), "/")
	group_uid := topicsSlice[1][6:]
	device_uid := topicsSlice[2][7:]
	topic_uid := topicsSlice[3][6:]
	topic := fmt.Sprintf("%s/%s", topicsSlice[2], topicsSlice[3])
	deleted := 0

	var payloadStruct map[string]interface{}
	err := json.Unmarshal(msg.Payload(), &payloadStruct)
	if err == nil && payloadStruct["timestamp"] != nil {
		timestampString := payloadStruct["timestamp"].(string)
		timestamp, error := time.Parse(time.RFC3339, timestampString)
		if error != nil {
			fmt.Println(error)
			return
		}
		delete(payloadStruct, "timestamp")
		payload, _ := json.Marshal(payloadStruct)

		if _, err := dbPool.Exec(context.Background(), sqlQuery, group_uid, device_uid, topic_uid, topic, payload, timestamp, deleted); err != nil {
			// Handling error, if occur
			fmt.Println("Unable to insert due to: ", err)
			return
		}
	}
}

func sendRowToChannelHandler1000ms(dbPool *pgxpool.Pool, msg mqtt.Message, rowChannel1000ms chan []interface{}) {
	timestamp := time.Now()
	payload := msg.Payload()

	topicsSlice := strings.Split(msg.Topic(), "/")
	group_uid := topicsSlice[1][6:]
	device_uid := topicsSlice[2][7:]
	topic_uid := topicsSlice[3][6:]
	topic := fmt.Sprintf("%s/%s", topicsSlice[2], topicsSlice[3])
	deleted := 0

	item := []interface{}{group_uid, device_uid, topic_uid, topic, payload, timestamp, deleted}
	rowChannel1000ms <- item
}

func sendRowToChannelHandler200ms(dbPool *pgxpool.Pool, msg mqtt.Message, rowChannel200ms chan []interface{}) {
	topicsSlice := strings.Split(msg.Topic(), "/")
	group_uid := topicsSlice[1][6:]
	device_uid := topicsSlice[2][7:]
	topic_uid := topicsSlice[3][6:]
	topic := fmt.Sprintf("%s/%s", topicsSlice[2], topicsSlice[3])
	deleted := 0

	var payloadStruct map[string]interface{}
	err := json.Unmarshal(msg.Payload(), &payloadStruct)
	if err == nil && payloadStruct["timestamp"] != nil {
		timestampString := payloadStruct["timestamp"].(string)
		timestamp, error := time.Parse(time.RFC3339, timestampString)
		if error != nil {
			fmt.Println(error)
			return
		}
		delete(payloadStruct, "timestamp")
		payload, _ := json.Marshal(payloadStruct)

		item := []interface{}{group_uid, device_uid, topic_uid, topic, payload, timestamp, deleted}
		rowChannel200ms <- item
	}
}

func saveRowsInDatabaseHandler(dbPool *pgxpool.Pool, rowsSlice [][]interface{}) {
	columnsNames := []string{"group_uid", "device_uid", "topic_uid", "topic", "payload", "timestamp", "deleted"}
	_, err := dbPool.CopyFrom(context.Background(), pgx.Identifier{"iot_data", "thingdata"}, columnsNames, pgx.CopyFromRows(rowsSlice))
	if err != nil {
		// Handling error, if occur
		fmt.Println("Unable to insert rows in database due to: ", err)
		return
	}
}

func appendRowInSlice200ms(dbPool *pgxpool.Pool, tickerStorage200ms *time.Ticker, rowChannel200ms chan []interface{}) {
	rowsSlice := [][]interface{}{}
	for {
		select {
		case row := <-rowChannel200ms:
			rowsSlice = append(rowsSlice, row)
			if len(rowsSlice) == 1000 {
				go saveRowsInDatabaseHandler(dbPool, rowsSlice)
				rowsSlice = nil
			}
		case <-tickerStorage200ms.C:
			if len(rowsSlice) != 0 {
				go saveRowsInDatabaseHandler(dbPool, rowsSlice)
				rowsSlice = nil
			}
		}
	}
}

func appendRowInSlice1000ms(dbPool *pgxpool.Pool, tickerStorage1000ms *time.Ticker, rowChannel1000ms chan []interface{}) {
	rowsSlice := [][]interface{}{}
	for {
		select {
		case row := <-rowChannel1000ms:
			rowsSlice = append(rowsSlice, row)
			if len(rowsSlice) == 1000 {
				go saveRowsInDatabaseHandler(dbPool, rowsSlice)
				rowsSlice = nil
			}
		case <-tickerStorage1000ms.C:
			if len(rowsSlice) != 0 {
				go saveRowsInDatabaseHandler(dbPool, rowsSlice)
				rowsSlice = nil
			}
		}
	}
}

func listen(subcribedTopic string, client mqtt.Client, dbPool *pgxpool.Pool, rowChannel1000ms chan []interface{}) {
	client.Subscribe(subcribedTopic, 0, func(client mqtt.Client, msg mqtt.Message) {
		go sendRowToChannelHandler1000ms(dbPool, msg, rowChannel1000ms)
	})
}

func listenWithTimestamp(subcribedTopic string, client mqtt.Client, dbPool *pgxpool.Pool, rowChannel200ms chan []interface{}) {
	client.Subscribe(subcribedTopic, 0, func(client mqtt.Client, msg mqtt.Message) {
		go sendRowToChannelHandler200ms(dbPool, msg, rowChannel200ms)
	})
}

func getConfigData() config {
	mqttClientId := "dev2pdb"
	mqttPort := 1883
	mqttBrokerServiceUrl := getEnv("MQTT_BROKER_SERVICE_URL", "mosquitto")
	dev2pdbUsername := getEnv("DEV2PDB_USERNAME", "dev2pdb")
	dev2pdbPassword := getParameterFromFileOrEnvVar("DEV2PDB_PASSWORD", "/run/secrets/dev2pdb_password.txt")
	timescaledbPassword := getParameterFromFileOrEnvVar("TIMESCALE_PASSWORD", "/run/secrets/timescaledb_password.txt")
	timescaledbUser := getParameterFromFileOrEnvVar("TIMESCALE_USER", "/run/secrets/timescaledb_user.txt")
	timescaledbServiceUrl := getEnv("TIMESCALE_SERVICE_URL", "timescaledb")
	databaseName := getEnv("DATABASE_NAME", "iot_data_db")
	return config{
		mqttClientId, 
		mqttPort, 
		mqttBrokerServiceUrl,
		dev2pdbUsername,
		dev2pdbPassword,
		timescaledbUser,
		timescaledbPassword, 
		timescaledbServiceUrl, 
		databaseName }
}


func getDatabaseUrl(configData config) string {
	user := configData.timescaledbUser
	password := configData.timescaledbPassword
	timescaledbUrl := configData.timescaledbServiceUrl
	databaseName := configData.databaseName
	return fmt.Sprintf("postgres://%s:%s@%s:5432/%s", user, password, timescaledbUrl, databaseName)
}

func getMqttBrokerUrl(configData config) string {
	return fmt.Sprintf("tcp://%s:%d", configData.mqttBrokerUrl, configData.mqttPort)
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func getParameterFromFileOrEnvVar(envVarName string, filePath string) string {
	if value, ok := os.LookupEnv(envVarName); ok {
		return value
	}

	file, err := os.Open(filePath)
	if err != nil {
		fmt.Printf("Error opening file: %v\n", err)
		os.Exit(1)
	}
	r := bufio.NewReader(file)
	line, _, err := r.ReadLine()
	if err != nil {
		fmt.Printf("Error reading line in file: %v\n", err)
		os.Exit(1)
	}
	return string(line)
}

func main() {
	configData := getConfigData()

	databaseUrl := getDatabaseUrl(configData)
	dbPool, err := pgxpool.Connect(context.Background(), databaseUrl)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect to database: %v\n", err)
		os.Exit(1)
	} else {
		fmt.Println("Connected to database")
	}

	// to close DB pool
	defer dbPool.Close()

	client := connectToMqttBroker(configData)
	rowChannel1000ms := make(chan []interface{})
	tickerStorage1000ms := time.NewTicker(1 * time.Second)
	go appendRowInSlice1000ms(dbPool, tickerStorage1000ms, rowChannel1000ms)
	go listen("dev2pdb/#", client, dbPool, rowChannel1000ms)
	go listen("dtm_as2pdb/#", client, dbPool, rowChannel1000ms)
	go listen("dtm_fmv2pdb/#", client, dbPool, rowChannel1000ms)

	rowChannel200ms := make(chan []interface{})
	tickerStorage200ms := time.NewTicker(200 * time.Millisecond)
	go appendRowInSlice200ms(dbPool, tickerStorage200ms, rowChannel200ms)
	go listenWithTimestamp("dev2pdb_wt/#", client, dbPool, rowChannel200ms)
	go listenWithTimestamp("dtm_as2pdb_wt/#", client, dbPool, rowChannel200ms)
	go listenWithTimestamp("dtm_fmv2pdb_wt/#", client, dbPool, rowChannel200ms)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(rw http.ResponseWriter, r *http.Request) { io.WriteString(rw, "Healthy") })
	err = http.ListenAndServe(fmt.Sprintf(":%s", "3300"), mux)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error listenging on port 3300: %v", err)
		os.Exit(1)
	}
}
