import { z } from "zod";

// CSS color: hex (#rgb..#rrggbbaa), named color (lowercase word), or rgb/rgba(...)
const ColorField = z
  .string()
  .regex(/^(#[0-9a-fA-F]{3,8}|[a-z]+|rgba?\(.+\))$/, "invalid CSS color");

// Layer 1 — exactly what the LLM emits. Validated strictly before anything else.
export const DrawCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("background"), color: ColorField }),
  z.object({ type: z.literal("clear") }),
  z.object({
    type: z.literal("circle"),
    cx: z.number(),
    cy: z.number(),
    r: z.number().positive(),
    fill: ColorField.optional(),
    stroke: ColorField.optional(),
    strokeWidth: z.number().optional(),
  }),
  z.object({
    type: z.literal("rect"),
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
    fill: ColorField.optional(),
    stroke: ColorField.optional(),
    strokeWidth: z.number().optional(),
    rx: z.number().optional(),
  }),
  z.object({
    type: z.literal("line"),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    color: ColorField.optional(),
    width: z.number().optional(),
  }),
  z.object({
    type: z.literal("triangle"),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    x3: z.number(),
    y3: z.number(),
    fill: ColorField.optional(),
    stroke: ColorField.optional(),
  }),
  z.object({
    type: z.literal("ellipse"),
    cx: z.number(),
    cy: z.number(),
    rx: z.number().positive(),
    ry: z.number().positive(),
    fill: ColorField.optional(),
    stroke: ColorField.optional(),
  }),
  z.object({
    type: z.literal("polygon"),
    points: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
    fill: ColorField.optional(),
    stroke: ColorField.optional(),
  }),
  z.object({
    type: z.literal("text"),
    x: z.number(),
    y: z.number(),
    content: z.string().max(500),
    font: z.string().optional(),
    color: ColorField.optional(),
    size: z.number().optional(),
  }),
  z.object({
    type: z.literal("arc"),
    cx: z.number(),
    cy: z.number(),
    r: z.number().positive(),
    startAngle: z.number(),
    endAngle: z.number(),
    color: ColorField.optional(),
    width: z.number().optional(),
  }),
]);

export const DrawCommandArraySchema = z.array(DrawCommandSchema).min(1).max(200);

export type DrawCommand = z.infer<typeof DrawCommandSchema>;
