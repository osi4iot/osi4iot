package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/jackc/pgx/v4/pgxpool"
)

type config struct {
	mqttClientId string
	mqttPort int
	mqttBrokerUrl string
	postgresPassword string
	postgresUser string
	postgresServiceUrl string
	databaseName string
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
		fmt.Printf("Client connected\n")
	}
	return client
}

func createClientOptions(configData config) *mqtt.ClientOptions {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(getMqttBrokerUrl(configData))
	opts.SetClientID(configData.mqttClientId)
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

func saveToDatabaseHandler(dbPool *pgxpool.Pool, msg mqtt.Message) {
	sqlQuery := "INSERT INTO iot_data.thingData (group_uid, device_uid, topic_uid, topic, payload, timestamp, deleted) VALUES ($1, $2, $3, $4, $5, $6, $7);"
	timestamp := time.Now()
	payload := msg.Payload()

	topicsSlice := strings.Split(msg.Topic(), "/")
	group_uid := topicsSlice[1][6:]
	device_uid := topicsSlice[2][7:]
	topic_uid := topicsSlice[3][6:]
	topic := fmt.Sprintf("%s/%s", topicsSlice[2], topicsSlice[3])
	deleted := 0

	if _, err := dbPool.Exec(context.Background(), sqlQuery, group_uid, device_uid, topic_uid, topic, payload, timestamp, deleted); err != nil {
		// Handling error, if occur
		fmt.Println("Unable to insert register in database due to: ", err)
		return
	}

}

func listen(subcribedTopic string, client mqtt.Client, dbPool *pgxpool.Pool) {
	client.Subscribe(subcribedTopic, 0, func(client mqtt.Client, msg mqtt.Message) {
		go saveToDatabaseHandler(dbPool, msg)
	})
}

func listenWithTimestamp(subcribedTopic string, client mqtt.Client, dbPool *pgxpool.Pool) {
	client.Subscribe(subcribedTopic, 0, func(client mqtt.Client, msg mqtt.Message) {
		saveToDatabaseWithTimestampHandler(dbPool, msg)
	})
}

func main() {
	keepAlive := make(chan os.Signal)
	signal.Notify(keepAlive, os.Interrupt, syscall.SIGTERM)
	configData:= getConfigData()


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

	go listen("dev2pdb/#", client, dbPool)
	go listenWithTimestamp("dev2pdb_with_timestamp/#", client, dbPool)
	go listen("dtm_as2pdb/#", client, dbPool)
	go listen("dtm_fmv2pdb/#", client, dbPool)

	<-keepAlive
}

func getConfigData() config {
	mqttClientId:= "dev2pdb"
	mqttPort:= 1883
	mqttBrokerServiceUrl:= getEnv("MQTT_BROKER_SERVICE_URL", "mosquitto")
	postgresPassword:= getParameterFromFileOrEnvVar("POSTGRES_PASSWORD","/run/secrets/postgres_password.txt")
	postgresUser:= getParameterFromFileOrEnvVar("POSTGRES_USER", "/run/secrets/postgres_user.txt")
	postgresServiceUrl:= getEnv("POSTGRES_SERVICE_URL", "postgres")
	databaseName:= getEnv("DATABASE_NAME", "iot_platform_db")
	return config{mqttClientId, mqttPort, mqttBrokerServiceUrl, postgresPassword, postgresUser, postgresServiceUrl, databaseName}
}

func getDatabaseUrl(configData config) string {
	user:= configData.postgresUser
	password:= configData.postgresPassword
	postgresUrl:= configData.postgresServiceUrl
	databaseName:= configData.databaseName
	return fmt.Sprintf("postgres://%s:%s@%s:5432/%s", user, password, postgresUrl, databaseName)
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
