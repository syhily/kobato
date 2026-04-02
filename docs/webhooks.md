---
title: "Webhooks"
description: Webhooks are specific events triggered when something happens in Kobato, like publishing a new post or receiving a new member
---

***

## Overview

Webhooks allows Kobato to send POST requests to user-configured URLs in order to send them a notification about it. The request body is a JSON object containing data about the triggered event, and the end result could be something as simple as a Slack notification or as complex as a total redeployment of a site.

## Setting up a webhook

Configuring webhooks can be done through the Kobato Admin user interface under `Settings > Advanced > Integrations > Add custom integration`. The only required fields to setup a new webhook are a trigger event and target URL to notify. This target URL is your application URL, the endpoint where the POST request will be sent. Of course, this URL must be reachable from the Internet.

If the server responds with 2xx HTTP response, the delivery is considered successful. Anything else is considered a failure of some kind, and anything returned in the body of the response will be discarded.

## Available events

Currently Kobato has support for below events on which webhook can be setup:

| Event                   | Description                                                          |
| ----------------------- | -------------------------------------------------------------------- |
| `site.changed`          | Triggered whenever any content changes in your site data or settings |
| `post.added`            | Triggered whenever a post is added to Kobato                         |
| `post.deleted`          | Triggered whenever a post is deleted from Kobato                     |
| `post.edited`           | Triggered whenever a post is edited in Kobato                        |
| `post.published`        | Triggered whenever a post is published to Kobato                     |
| `post.published.edited` | Triggered whenever a published post is edited in Kobato              |
| `post.unpublished`      | Triggered whenever a post is unpublished from Kobato                 |
| `post.scheduled`        | Triggered whenever a post is scheduled to be published in Kobato     |
| `post.unscheduled`      | Triggered whenever a post is unscheduled from publishing in Kobato   |
| `post.rescheduled`      | Triggered whenever a post is rescheduled to publish in Kobato        |
| `page.added`            | Triggered whenever a page is added to Kobato                         |
| `page.deleted`          | Triggered whenever a page is deleted from Kobato                     |
| `page.edited`           | Triggered whenever a page is edited in Kobato                        |
| `page.published`        | Triggered whenever a page is published to Kobato                     |
| `page.published.edited` | Triggered whenever a published page is edited in Kobato              |
| `page.unpublished`      | Triggered whenever a page is unpublished from Kobato                 |
| `page.scheduled`        | Triggered whenever a page is scheduled to be published in Kobato     |
| `page.unscheduled`      | Triggered whenever a page is unscheduled from publishing in Kobato   |
| `page.rescheduled`      | Triggered whenever a page is rescheduled to publish in Kobato        |
| `tag.added`             | Triggered whenever a tag is added to Kobato                          |
| `tag.edited`            | Triggered whenever a tag is edited in Kobato                         |
| `tag.deleted`           | Triggered whenever a tag is deleted from Kobato                      |
| `post.tag.attached`     | Triggered whenever a tag is attached to a post in Kobato             |
| `post.tag.detached`     | Triggered whenever a tag is detached from a post in Kobato           |
| `page.tag.attached`     | Triggered whenever a tag is attached to a page in Kobato             |
| `page.tag.detached`     | Triggered whenever a tag is detached from a page in Kobato           |
| `member.added`          | Triggered whenever a member is added to Kobato                       |
| `member.edited`         | Triggered whenever a member is edited in Kobato                      |
| `member.deleted`        | Triggered whenever a member is deleted from Kobato                   |
