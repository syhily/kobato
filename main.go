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

// Options for the CLI.
type Options struct {
	Port int `help:"Port to listen on" short:"p" default:"8888"`
}

func addRoutes(_ huma.API) {
	// TODO: Add routes here
}

func main() {
	// Create a new router & API
	router := fiber.New()

	// Create a CLI app which takes a port option.
	cli := humacli.New(func(hooks humacli.Hooks, options *Options) {
		api := adapter.New(router, huma.DefaultConfig("Kobato API", "1.0.0"))

		addRoutes(api)

		// Tell the CLI how to start your server.
		hooks.OnStart(func() {
			log.Infof("Starting server on port %d...\n", options.Port)
			if err := router.Listen(fmt.Sprintf(":%d", options.Port)); err != nil {
				log.Errorf("Error starting server: %v", err)
			}
		})

		hooks.OnStop(func() {
			// Gracefully shutdown your server here
			log.Infof("Stopping server on port %d...\n", options.Port)
			if err := router.Shutdown(); err != nil {
				log.Errorf("Error shutting down server: %v", err)
			}
		})
	})

	// Run the CLI. When passed no commands, it starts the server.
	cli.Run()
}
