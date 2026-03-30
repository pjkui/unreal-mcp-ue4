import { z } from "zod"

export const vector2InputSchema = z.union([
	z.object({ x: z.number(), y: z.number() }),
	z.tuple([z.number(), z.number()]),
])

export const vector3InputSchema = z.union([
	z.object({ x: z.number(), y: z.number(), z: z.number() }),
	z.tuple([z.number(), z.number(), z.number()]),
])

export const rotatorInputSchema = z.union([
	z.object({ pitch: z.number(), yaw: z.number(), roll: z.number() }),
	z.tuple([z.number(), z.number(), z.number()]),
])

export const colorInputSchema = z.union([
	z.object({
		r: z.number(),
		g: z.number(),
		b: z.number(),
		a: z.number().optional(),
	}),
	z.tuple([z.number(), z.number(), z.number(), z.number()]),
])

export const recordSchema = z.record(z.any())
export const stringListSchema = z.array(z.string().min(1)).min(1)

export const worldBuildBaseSchema = {
	location: vector3InputSchema.optional().describe("Optional world location"),
	material_path: z.string().optional().describe("Optional material path to apply"),
	prefix: z.string().optional().describe("Optional actor label prefix"),
}

export function toVector2Record(value: any) {
	if (!value) {
		return undefined
	}

	if (Array.isArray(value)) {
		return { x: Number(value[0] ?? 0), y: Number(value[1] ?? 0) }
	}

	return { x: Number(value.x ?? 0), y: Number(value.y ?? 0) }
}

export function toVector3Record(value: any) {
	if (!value) {
		return undefined
	}

	if (Array.isArray(value)) {
		return {
			x: Number(value[0] ?? 0),
			y: Number(value[1] ?? 0),
			z: Number(value[2] ?? 0),
		}
	}

	return {
		x: Number(value.x ?? 0),
		y: Number(value.y ?? 0),
		z: Number(value.z ?? 0),
	}
}

export function toRotatorRecord(value: any) {
	if (!value) {
		return undefined
	}

	if (Array.isArray(value)) {
		return {
			pitch: Number(value[0] ?? 0),
			yaw: Number(value[1] ?? 0),
			roll: Number(value[2] ?? 0),
		}
	}

	return {
		pitch: Number(value.pitch ?? 0),
		yaw: Number(value.yaw ?? 0),
		roll: Number(value.roll ?? 0),
	}
}

export function toVector2Array(value?: { x: number; y: number } | [number, number]) {
	return !value ? undefined : Array.isArray(value) ? value : [value.x, value.y]
}

export function toVector3Array(
	value?: { x: number; y: number; z: number } | [number, number, number],
) {
	return !value ? undefined : Array.isArray(value) ? value : [value.x, value.y, value.z]
}

export function toRotatorArray(
	value?: { pitch: number; yaw: number; roll: number } | [number, number, number],
) {
	return !value ? undefined : Array.isArray(value) ? value : [value.pitch, value.yaw, value.roll]
}

export function toColorRecord(
	value?: { r: number; g: number; b: number; a?: number } | [number, number, number, number],
) {
	if (!value) {
		return undefined
	}

	return Array.isArray(value)
		? { r: value[0], g: value[1], b: value[2], a: value[3] ?? 1 }
		: { r: value.r, g: value.g, b: value.b, a: value.a ?? 1 }
}

export function toColorArray(
	value?: { r: number; g: number; b: number; a?: number } | [number, number, number, number],
) {
	const colorRecord = toColorRecord(value)
	return colorRecord
		? [colorRecord.r, colorRecord.g, colorRecord.b, colorRecord.a]
		: undefined
}
