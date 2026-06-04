package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

func main() {
	collect := flag.String(
		"collect", "",
		"comma-separated collectors to run (required).\n"+
			"  Wide-format (→ dedicated TimescaleDB tables):\n"+
			"    host              → host_metrics\n"+
			"    host_state        → host_node_state  (managers only)\n"+
			"    containers        → container_metrics\n"+
			"    volumes           → volumes_metrics\n",
	)
	pretty := flag.Bool("pretty", false, "output indented JSON (for debugging)")
	interval := flag.Duration("interval", 0, "if > 0, run collectors in a loop with this interval")
	flag.Parse()

	if *collect == "" {
		fmt.Fprintln(os.Stderr, "error: --collect is required")
		flag.Usage()
		os.Exit(1)
	}

	selected := parseCollectors(*collect)
	if len(selected) == 0 {
		fmt.Fprintf(os.Stderr,
			"error: no valid collector in %q.\n"+
				"Valid: host, containers, volumes\n",
			*collect,
		)
		os.Exit(1)
	}

	run := func() error {
		for _, c := range selected {
			var err error
			switch c {
			case "host":
				err = collectHost(*pretty)
			case "host_state":
				err = collectHostState(*pretty)
			case "containers":
				err = collectContainers(*pretty)
			case "volumes":
				err = collectVolumes(*pretty)
			}
			if err != nil {
				log.Printf("[%s] collection error: %v", c, err)
			}
		}
		return nil
	}

	if *interval > 0 {
		for {
			if err := run(); err != nil {
				log.Printf("run error: %v", err)
			}
			time.Sleep(*interval)
		}
	} else {
		if err := run(); err != nil {
			os.Exit(1)
		}
	}
}

func parseCollectors(raw string) []string {
	valid := map[string]bool{
		"host":       true,
		"host_state": true,
		"containers": true,
		"volumes":    true,
	}
	var out []string
	for _, part := range strings.Split(raw, ",") {
		c := strings.TrimSpace(strings.ToLower(part))
		if valid[c] {
			out = append(out, c)
		} else if c != "" {
			fmt.Fprintf(os.Stderr, "warning: unknown collector %q, skipping\n", c)
		}
	}
	return out
}

func labelOrDefault(labels map[string]string, key, fallback string) string {
	if v, ok := labels[key]; ok && v != "" {
		return v
	}
	return fallback
}