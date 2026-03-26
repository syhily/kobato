package main

import (
	"fmt"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humacli"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
	"github.com/syhily/kobato/adapter"

	_ "github.com/danielgtaylor/huma/v2/formats/cbor"
)

// Options for the Kobato API server.
type Options struct {
	Port  int  `help:"Port to listen on" short:"p" default:"8888"`
	Debug bool `help:"Enable debug mode" short:"d" default:"false"`
}

func addRoutes(_ huma.API) {
	// TODO: Add routes here
}

func main() {
	cli := humacli.New(func(hooks humacli.Hooks, options *Options) {
		// Set the log level to debug if debug mode is enabled
		if options.Debug {
			log.SetLevel(log.LevelDebug)
		} else {
			log.SetLevel(log.LevelInfo)
		}

		// Create Kobato API server using Fiber adapter
		router := fiber.New()

		api := adapter.New(router, huma.DefaultConfig("Kobato API", "1.0.0"))

		addRoutes(api)

		hooks.OnStart(func() {
			log.Infof("Starting server on port %d...\n", options.Port)
			if err := router.Listen(fmt.Sprintf(":%d", options.Port)); err != nil {
				log.Errorf("Error starting server: %v", err)
			}
		})

		hooks.OnStop(func() {
			log.Infof("Stopping server on port %d...\n", options.Port)
			if err := router.Shutdown(); err != nil {
				log.Errorf("Error shutting down server: %v", err)
			}
			log.Infof("Server on port %d stopped successfully!", options.Port)
		})
	})

	// Run the Kobato API server.
	cli.Run()
}
