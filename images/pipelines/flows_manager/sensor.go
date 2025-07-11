package flows_manager

import (
	"pipelines/common"
	"strconv"
)

func (fm *FlowsManager) GetSensors() []*common.Sensor {
	var sensors []*common.Sensor
	fm.Sensors.Range(func(key, value interface{}) bool {
		sensors = append(sensors, value.(*common.Sensor))
		return true
	})
	return sensors
}

func (fm *FlowsManager) GetSensor(sensorId int) *common.Sensor {
	if sensor, ok := fm.Sensors.Load(strconv.Itoa(sensorId)); ok {
		return sensor.(*common.Sensor)
	}
	return nil
}

func (fm *FlowsManager) AddSensor(sensor *common.Sensor) {
	sensorIdStr := strconv.Itoa(sensor.Id)
	if _, ok := fm.Sensors.Load(sensorIdStr); !ok {
		fm.Sensors.Store(sensorIdStr, sensor)
	} else {
		fm.log.Error("Sensor with ID %d already exists", sensor.Id)
	}
}

func (fm *FlowsManager) AddSensors(sensors []*common.Sensor) {
	for _, sensor := range sensors {
		sensorIdStr := strconv.Itoa(sensor.Id)
		if _, ok := fm.Sensors.Load(sensorIdStr); !ok {
			fm.Sensors.Store(sensorIdStr, sensor)
		} else {
			fm.log.Error("Sensor with ID %d already exists", sensor.Id)
		}
	}
}

func (fm *FlowsManager) DeleteSensor(sensorId int) error {
	sensorIdStr := strconv.Itoa(sensorId)
	if _, ok := fm.Sensors.Load(sensorIdStr); ok {
		fm.Sensors.Delete(sensorIdStr)
		return nil
	}
	return common.ErrNotFound
}

func (fm *FlowsManager) UpdateSensor(sensor *common.Sensor) error {
	sensorIdStr := strconv.Itoa(sensor.Id)
	if _, ok := fm.Sensors.Load(sensorIdStr); ok {
		fm.Sensors.Store(sensorIdStr, sensor)
		return nil
	}
	return common.ErrNotFound
}