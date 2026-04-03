package main

import (
	"fmt"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humacli"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
	"github.com/syhily/kobato/adapter"
	"github.com/syhily/kobato/apis"

	_ "github.com/danielgtaylor/huma/v2/formats/cbor"
)

type Options struct {
	Port    int  `help:"Port to listen on" short:"p" default:"8888"`
	Debug   bool `help:"Enable debug mode" short:"d" default:"false"`
	APIDocs bool `help:"Enable API docs" default:"true"`
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
		router := fiber.New(fiber.Config{
			AppName:      "Kobato",
			ServerHeader: fmt.Sprintf("Kobato/%s", ShortVersion()),
		})

		humaConfig := huma.DefaultConfig("Kobato API", ShortVersion())
		apis.AddAPIConfigs(humaConfig, options.APIDocs)
		api := adapter.New(router, humaConfig)

		apis.AddAPIRoutes(api)

		router.Hooks().OnPreStartupMessage(func(sm *fiber.PreStartupMessageData) error {
			sm.BannerHeader = fmt.Sprintf(bannerHeader, ShortVersion(), time.Now().Format("2006-01-02 15:04:05"))
			return nil
		})

		// TODO Add the database migration.
		router.Hooks().OnPostStartupMessage(func(_ *fiber.PostStartupMessageData) error {
			return nil
		})

		hooks.OnStart(func() {
			if err := router.Listen(fmt.Sprintf(":%d", options.Port), fiber.ListenConfig{
				EnablePrefork: true,
			}); err != nil {
				log.Errorf("Error starting server: %v", err)
			}
		})

		hooks.OnStop(func() {
			if err := router.ShutdownWithTimeout(time.Second * 5); err != nil {
				log.Errorf("Error shutting down server: %v", err)
			}
			log.Infof("Server on port %d stopped successfully!", options.Port)
		})
	})

	cmd := cli.Root()
	cmd.Use = "kobato"
	cmd.Short = "Kobato"
	cmd.Long = "Kobato is a headless blog engine for content creators."
	cmd.Version = LongVersion()

	// Run the Kobato API server.
	cli.Run()
}
