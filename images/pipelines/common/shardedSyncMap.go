package common

import (
	"hash/fnv"
	"sync"
)

type ShardedSyncMap struct {
	shards []sync.Map
	mask   uint32
}

func NewShardedSyncMap(shardCount int) *ShardedSyncMap {
	if shardCount <= 0 || (shardCount&(shardCount-1)) != 0 {
		panic("shardCount must be a power of 2")
	}

	return &ShardedSyncMap{
		shards: make([]sync.Map, shardCount),
		mask:   uint32(shardCount - 1),
	}
}

// getShard returns the shard for the given key.
func (sm *ShardedSyncMap) getShard(key string) *sync.Map {
	hash := fnv.New32a()
	hash.Write([]byte(key))
	return &sm.shards[hash.Sum32()&sm.mask]
}

// Load retrieves the value for the key if it exists.
// It returns the value and a boolean indicating whether the key was found.
// If the key does not exist, it returns nil and false.
func (sm *ShardedSyncMap) Load(key string) (interface{}, bool) {
	return sm.getShard(key).Load(key)
}

// Store sets the value for the key in the map.
// If the key already exists, it updates the value.
// If the key does not exist, it adds the key-value pair to the map.
func (sm *ShardedSyncMap) Store(key string, value interface{}) {
	sm.getShard(key).Store(key, value)
}

// Delete removes the key and its value from the map.
// If the key does not exist, it does nothing.
func (sm *ShardedSyncMap) Delete(key string) {
	sm.getShard(key).Delete(key)
}

// Range iterates over all key-value pairs in the map.
// The provided function f is called for each key-value pair.
// If f returns false, the iteration stops.
func (sm *ShardedSyncMap) Range(f func(key, value interface{}) bool) {
	for i := range sm.shards {
		shouldContinue := true
		sm.shards[i].Range(func(key, value interface{}) bool {
			if !f(key, value) {
				shouldContinue = false
				return false
			}
			return true
		})
		if !shouldContinue {
			break
		}
	}
}

// LoadOrStore retrieves the value for the key if it exists, or stores the value and returns it.
// It is an atomic operation, ensuring that if multiple goroutines call LoadOrStore concurrently,
// only one will succeed in storing the value.
func (sm *ShardedSyncMap) LoadOrStore(key string, value interface{}) (interface{}, bool) {
	return sm.getShard(key).LoadOrStore(key, value)
}

// LoadAndDelete retrieves the value for the key and deletes it from the map.
// If the key does not exist, it returns nil and false.
// If the key exists, it returns the value and true.
// It is an atomic operation, ensuring that if multiple goroutines call LoadAndDelete concurrently,
// only one will succeed in deleting the value.
func (sm *ShardedSyncMap) LoadAndDelete(key string) (interface{}, bool) {
	return sm.getShard(key).LoadAndDelete(key)
}

// CompareAndSwap atomically compares the value for the key with the old value.
// If they are equal, it replaces the value with the new value and returns true.
// If the key does not exist or the value is not equal to the old value, it
// does not change the value and returns false.
// It is an atomic operation, ensuring that if multiple goroutines call CompareAndSwap concurrently,
// only one will succeed in swapping the value.
func (sm *ShardedSyncMap) CompareAndSwap(key string, old, new interface{}) bool {
	return sm.getShard(key).CompareAndSwap(key, old, new)
}

// Swap atomically replaces the value for the key with the new value and returns the old value.
// If the key does not exist, it stores the new value and returns nil.
// It is an atomic operation, ensuring that if multiple goroutines call Swap concurrently,
// only one will succeed in swapping the value.
func (sm *ShardedSyncMap) Swap(key string, value interface{}) (interface{}, bool) {
	return sm.getShard(key).Swap(key, value)
}
