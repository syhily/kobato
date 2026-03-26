package main

import (
	"fmt"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humacli"
	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/log"
	"github.com/syhily/kobato/adapter"

	_ "github.com/danielgtaylor/huma/v2/formats/cbor"
)

const (
	// Banner header for the Kobato API server. Plan to change it to a more stylish one.
	bannerHeader = ` __   ___   ______    _______       __  ___________  ______
|/"| /  ") /    " \  |   _  "\     /""\("     _   ")/    " \
(: |/   / // ____  \ (. |_)  :)   /    \)__/  \\__/// ____  \
|    __/ /  /    ) :)|:     \/   /' /\  \  \\_ /  /  /    ) :)
(// _  \(: (____/ // (|  _  \\  //  __'  \ |.  | (: (____/ //
|: | \  \\        /  |: |_)  :)/   /  \\  \\:  |  \        /
(__|  \__)\"_____/   (_______/(___/    \___)\__|   \"_____/

Kobato :: %s :: %s

`
)

// Options for the Kobato API server.
type Options struct {
	Port    int  `help:"Port to listen on" short:"p" default:"8888"`
	Debug   bool `help:"Enable debug mode" short:"d" default:"false"`
	APIDocs bool `help:"Enable API docs" default:"true"`
}

func addAPIRoutes(_ huma.API) {
	// TODO: Add API routes here
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

		config := huma.DefaultConfig("Kobato API", ShortVersion())
		// The OpenAPI and docs should be disabled for a production running instance.
		if !options.APIDocs {
			config.OpenAPIPath = ""
			config.DocsPath = ""
			config.SchemasPath = ""
		}
		api := adapter.New(router, config)

		addAPIRoutes(api)

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
