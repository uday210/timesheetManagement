/**
 * /api/device/openapi — OpenAPI 3.0 spec for the device (printer) control API,
 * for registering as a Salesforce External Service.
 *
 * These endpoints are token-gated (DEVICE_API_TOKEN), so register them behind a
 * Named Credential that adds `Authorization: Bearer <token>` — separate from the
 * no-auth timesheet service.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function baseUrl(request: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  const h = request.headers;
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(request: Request) {
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "ITSM Device Control API",
      description:
        "Remotely operate registered hardware (the Epson ET-2800 printer) via a " +
        "local connector. Each call enqueues a command and waits for the result.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl(request) }],
    paths: {
      "/api/device/commands": {
        post: {
          operationId: "runPrinterCommand",
          summary: "Run a command on the printer and return the result",
          description:
            "Commands: 'status' (state + ink + issues), 'identify' (printer beeps/flashes), " +
            "'print_test' (diagnostic page), 'print_text' (print the provided text), " +
            "'print_file' (download and print the file at fileUrl), 'scan' (scan the glass and " +
            "return a viewable image URL in the summary), 'clear_queue' (clear stuck jobs), " +
            "'restart' (power-cycle; only if a smart plug is configured).",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PrinterCommandRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Command result",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PrinterCommandResult" },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        PrinterCommandRequest: {
          type: "object",
          required: ["command"],
          properties: {
            command: {
              type: "string",
              enum: [
                "status",
                "identify",
                "print_test",
                "print_text",
                "print_file",
                "scan",
                "clear_queue",
                "restart",
              ],
              description: "The action to perform on the printer.",
            },
            text: {
              type: "string",
              description: "Text to print. Required when command is 'print_text'.",
            },
            fileUrl: {
              type: "string",
              description:
                "URL of a PDF/image to download and print. Required when command is 'print_file'.",
            },
            device: {
              type: "string",
              description: "Device id. Optional; defaults to printer-et2800.",
            },
          },
        },
        PrinterCommandResult: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "done | error | timeout",
            },
            summary: {
              type: "string",
              description: "Human-readable result the agent can relay to the user.",
            },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, { headers: { "Access-Control-Allow-Origin": "*" } });
}
