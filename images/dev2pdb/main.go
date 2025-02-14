package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/buger/jsonparser"
	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/jackc/pgx/v4"
	"github.com/jackc/pgx/v4/pgxpool"
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

func AdminApiQuery() bool {
	client := http.Client{
		Timeout: 5 * time.Second,
	}

	url := "http://admin_api:3200/health"
	resp, err := client.Get(url)
	if err != nil {
		fmt.Printf("Error connecting to Admin API: %v\n", err)
		return false
	}
	defer resp.Body.Close()

	return resp.StatusCode == http.StatusOK
}

func isAdminApiHealthy() bool {
	isHealthy := false
	numTrials := 5
	numMaxIterations := 60
	numIter := 0
	for {
		numTrueTrials := 0
		for i := 0; i < numTrials; i++ {
			if AdminApiQuery() {
				numTrueTrials++
			}
			time.Sleep(2 * time.Second)
		}
		if numTrueTrials == numTrials {
			isHealthy = true
			break
		}
		numIter++
		if numIter == numMaxIterations {
			break
		}
		fmt.Println("Admin API is not healthy yet. Retrying...")
		time.Sleep(10 * time.Second)
	}
	return isHealthy
}

// func isAdminApiHealthy() bool {
//     client := http.Client{
//         Timeout: 5 * time.Second,
//     }

// 	url := "http://admin_api:3200/health"
//     resp, err := client.Get(url)
//     if err != nil {
//         fmt.Printf("Error connecting to Admin API: %v\n", err)
//         return false
//     }
//     defer resp.Body.Close()

//     return resp.StatusCode == http.StatusOK
// }

func connectToMqttBroker(configData config) mqtt.Client {
	opts := createClientOptions(configData)
	client := mqtt.NewClient(opts)
	token := client.Connect()

	for !token.WaitTimeout(3 * time.Second) {
	}

	if err := token.Error(); err != nil {
		time.Sleep(70 * time.Second) //Wait until the mosquitto_gp_auth service clean the cache
		log.Fatal("Dev2pdb service could not connect to mqtt broker: ", err)
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

func sendRowToChannelHandler1000ms(msg mqtt.Message, rowChannel1000ms chan []interface{}) {
	timestamp := time.Now()
	payload := msg.Payload()

	topicsSlice := strings.Split(msg.Topic(), "/")
	group_uid := topicsSlice[1][6:]
	topic_uid := topicsSlice[2][6:]
	topic := topicsSlice[2]
	deleted := 0

	item := []interface{}{group_uid, topic_uid, topic, payload, timestamp, deleted}
	rowChannel1000ms <- item
}

func sendRowToChannelHandler200ms(msg mqtt.Message, rowChannel200ms chan []interface{}) {
	topicsSlice := strings.Split(msg.Topic(), "/")
	group_uid := topicsSlice[1][6:]
	topic_uid := topicsSlice[2][6:]
	topic := topicsSlice[2]
	deleted := 0

	timestampString, err := jsonparser.GetString(msg.Payload(), "timestamp");
	if err != nil {
		fmt.Println("Timestamp field not defined")
		return
	} else {
		timestamp, error := time.Parse(time.RFC3339, timestampString)
		if error != nil {
			fmt.Println(error)
			return
		}
		payload := jsonparser.Delete(msg.Payload(), "timestamp")
		item := []interface{}{group_uid, topic_uid, topic, payload, timestamp, deleted}
		rowChannel200ms <- item
	}
}

func sendRowToChannelHandlerMessagedArray(msg mqtt.Message, rowChannel1000ms chan []interface{}) {
	messagesArray := msg.Payload()
	topicsSlice := strings.Split(msg.Topic(), "/")
	group_uid := topicsSlice[1][6:]
	topic_uid := topicsSlice[2][6:]
	topic := topicsSlice[2]
	deleted := 0

	jsonparser.ArrayEach(messagesArray, func(message []byte, dataType jsonparser.ValueType, offset int, innerErr error) {
		timestampString, err := jsonparser.GetString(message, "timestamp");
		if err != nil {
			fmt.Println("Timestamp field not defined")
			return
		} else {
			timestamp, error := time.Parse(time.RFC3339, timestampString)
			if error != nil {
				fmt.Println(error)
				return
			}
			payload := jsonparser.Delete(message, "timestamp")
			item := []interface{}{group_uid, topic_uid, topic, payload, timestamp, deleted}
			rowChannel1000ms <- item
		}
	})
}

func saveRowsInDatabaseHandler(dbPool *pgxpool.Pool, rowsSlice [][]interface{}) {
	columnsNames := []string{"group_uid", "topic_uid", "topic", "payload", "timestamp", "deleted"}
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

func listen(subcribedTopic string, client mqtt.Client, rowChannel1000ms chan []interface{}) {
	client.Subscribe(subcribedTopic, 0, func(client mqtt.Client, msg mqtt.Message) {
		go sendRowToChannelHandler1000ms(msg, rowChannel1000ms)
	})
}

func listenMessagesArray(subcribedTopic string, client mqtt.Client, rowChannel1000ms chan []interface{}) {
	client.Subscribe(subcribedTopic, 0, func(client mqtt.Client, msg mqtt.Message) {
		go sendRowToChannelHandlerMessagedArray(msg, rowChannel1000ms)
	})
}

func listenWithTimestamp(subcribedTopic string, client mqtt.Client, rowChannel200ms chan []interface{}) {
	client.Subscribe(subcribedTopic, 0, func(client mqtt.Client, msg mqtt.Message) {
		go sendRowToChannelHandler200ms(msg, rowChannel200ms)
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
	// Check if the Admin API is healthy
	if !isAdminApiHealthy() {
		log.Fatal("Admin API service is not healthy")
	} else {
		time.Sleep(10 * time.Second) // Wait until the user dev2pdb is created
	}

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
	go listen("dev2pdb/#", client, rowChannel1000ms)
	go listenMessagesArray("dev2pdb_ma/#", client, rowChannel1000ms)
	go listen("dtm2pdb/#", client, rowChannel1000ms)

	rowChannel200ms := make(chan []interface{})
	tickerStorage200ms := time.NewTicker(200 * time.Millisecond)
	go appendRowInSlice200ms(dbPool, tickerStorage200ms, rowChannel200ms)
	go listenWithTimestamp("dev2pdb_wt/#", client, rowChannel200ms)

	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(rw http.ResponseWriter, r *http.Request) { io.WriteString(rw, "Healthy") })
	err = http.ListenAndServe(fmt.Sprintf(":%s", "3300"), mux)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error listenging on port 3300: %v", err)
		os.Exit(1)
	}
	  
}