import { z } from "zod";

import type { JsonObject } from "./contracts";
import { ToolRegistry } from "./tool-registry";

const sumNumbersArgsSchema = z.object({
  numbers: z.array(z.number()).min(1),
});

const getCurrentTimeArgsSchema = z.object({
  locale: z.string().optional(),
});

const toUpperCaseArgsSchema = z.object({
  text: z.string().min(1),
});

const multiplyNumbersArgsSchema = z.object({
  numbers: z.array(z.number()).min(1),
});

const averageNumbersArgsSchema = z.object({
  numbers: z.array(z.number()).min(1),
});

const convertTemperatureArgsSchema = z.object({
  value: z.number(),
  fromUnit: z.enum(["C", "F"]),
  toUnit: z.enum(["C", "F"]),
});

const extractEmailsArgsSchema = z.object({
  text: z.string().min(1),
});

const slugifyTextArgsSchema = z.object({
  text: z.string().min(1),
});

const wordStatsArgsSchema = z.object({
  text: z.string().min(1),
});

const daysBetweenDatesArgsSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const sortNumbersArgsSchema = z.object({
  numbers: z.array(z.number()).min(1),
  order: z.enum(["asc", "desc"]).default("asc"),
});

const calculatePercentageArgsSchema = z.object({
  numerator: z.number(),
  denominator: z.number().refine((value) => value !== 0, {
    message: "denominator must not be 0",
  }),
  precision: z.number().int().min(0).max(4).default(2),
});

const extractNumberSequenceArgsSchema = z.object({
  text: z.string().min(1),
  dedupe: z.boolean().default(false),
});

const trimAndExcerptArgsSchema = z.object({
  text: z.string().min(1),
  maxLength: z.number().int().min(5).max(240),
  withEllipsis: z.boolean().default(true),
});

export function createDemoToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    name: "sum_numbers",
    description: "Sum an array of numbers and return the total.",
    argsSchema: sumNumbersArgsSchema,
    execute: async (args) => {
      const total = args.numbers.reduce((acc, current) => acc + current, 0);
      return { total };
    },
  });

  registry.register({
    name: "get_current_time",
    description: "Return the current ISO timestamp and locale rendering.",
    argsSchema: getCurrentTimeArgsSchema,
    execute: async (args, context) => {
      const locale = args.locale ?? "en-US";
      return {
        iso: context.now.toISOString(),
        localized: context.now.toLocaleString(locale),
        locale,
      };
    },
  });

  registry.register({
    name: "to_uppercase",
    description: "Convert text to uppercase.",
    argsSchema: toUpperCaseArgsSchema,
    execute: async (args) => {
      return {
        transformed: args.text.toUpperCase(),
      };
    },
  });

  registry.register({
    name: "multiply_numbers",
    description: "Multiply an array of numbers and return the product.",
    argsSchema: multiplyNumbersArgsSchema,
    execute: async (args) => {
      const product = args.numbers.reduce((acc, current) => acc * current, 1);
      return { product };
    },
  });

  registry.register({
    name: "average_numbers",
    description: "Return arithmetic mean of number array.",
    argsSchema: averageNumbersArgsSchema,
    execute: async (args) => {
      const sum = args.numbers.reduce((acc, current) => acc + current, 0);
      return { average: sum / args.numbers.length };
    },
  });

  registry.register({
    name: "convert_temperature",
    description:
      "Convert temperature between Celsius and Fahrenheit (units: C or F).",
    argsSchema: convertTemperatureArgsSchema,
    execute: async (args) => {
      if (args.fromUnit === args.toUnit) {
        return {
          value: roundTwo(args.value),
          unit: args.toUnit,
        };
      }

      if (args.fromUnit === "C") {
        return {
          value: roundTwo((args.value * 9) / 5 + 32),
          unit: "F",
        };
      }

      return {
        value: roundTwo(((args.value - 32) * 5) / 9),
        unit: "C",
      };
    },
  });

  registry.register({
    name: "extract_emails",
    description: "Extract unique emails from free-form text.",
    argsSchema: extractEmailsArgsSchema,
    execute: async (args) => {
      const matches = args.text.match(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      );
      const unique = [...new Set(matches ?? [])];
      return {
        emails: unique,
        count: unique.length,
      };
    },
  });

  registry.register({
    name: "slugify_text",
    description: "Convert text to URL-safe slug.",
    argsSchema: slugifyTextArgsSchema,
    execute: async (args) => {
      const slug = args.text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");

      return { slug };
    },
  });

  registry.register({
    name: "word_stats",
    description:
      "Return simple text statistics: words, chars, lines, reading minutes.",
    argsSchema: wordStatsArgsSchema,
    execute: async (args) => {
      const trimmed = args.text.trim();
      const words = trimmed.length === 0 ? [] : trimmed.split(/\s+/);
      const lines = args.text.split(/\r?\n/);
      return {
        words: words.length,
        characters: args.text.length,
        lines: lines.length,
        estimatedReadingMinutes: roundTwo(words.length / 200),
      };
    },
  });

  registry.register({
    name: "days_between_dates",
    description: "Calculate absolute day difference between two ISO dates.",
    argsSchema: daysBetweenDatesArgsSchema,
    execute: async (args) => {
      const startMs = Date.parse(`${args.startDate}T00:00:00Z`);
      const endMs = Date.parse(`${args.endDate}T00:00:00Z`);
      const diffMs = Math.abs(endMs - startMs);
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      return { days };
    },
  });

  registry.register({
    name: "sort_numbers",
    description: "Sort number array ascending or descending.",
    argsSchema: sortNumbersArgsSchema,
    execute: async (args) => {
      const sorted = [...args.numbers].sort((a, b) => a - b);
      if (args.order === "desc") {
        sorted.reverse();
      }
      return { sorted, order: args.order };
    },
  });

  registry.register({
    name: "calculate_percentage",
    description:
      "Calculate percentage as (numerator / denominator) * 100 with configurable precision.",
    argsSchema: calculatePercentageArgsSchema,
    execute: async (args) => {
      const percentage = (args.numerator / args.denominator) * 100;
      return {
        percentage: Number(percentage.toFixed(args.precision)),
        precision: args.precision,
      };
    },
  });

  registry.register({
    name: "extract_number_sequence",
    description: "Extract numbers from text in appearance order, with optional dedupe.",
    argsSchema: extractNumberSequenceArgsSchema,
    execute: async (args) => {
      const matches = args.text.match(/-?\d+(?:\.\d+)?/g) ?? [];
      const values = matches.map((value) => Number(value));
      const numbers = args.dedupe ? [...new Set(values)] : values;
      return {
        numbers,
        count: numbers.length,
      };
    },
  });

  registry.register({
    name: "trim_and_excerpt",
    description:
      "Trim text and return a bounded excerpt that optionally appends an ellipsis.",
    argsSchema: trimAndExcerptArgsSchema,
    execute: async (args) => {
      const trimmed = args.text.trim();
      if (trimmed.length <= args.maxLength) {
        return { excerpt: trimmed, truncated: false };
      }

      const safeLength = Math.max(1, args.maxLength - (args.withEllipsis ? 3 : 0));
      const base = trimmed.slice(0, safeLength).trimEnd();
      return {
        excerpt: args.withEllipsis ? `${base}...` : base,
        truncated: true,
      };
    },
  });

  return registry;
}

export function createTestToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register({
    name: "sum_numbers",
    description: "Sum numbers for tests.",
    argsSchema: sumNumbersArgsSchema,
    execute: async (args): Promise<JsonObject> => {
      const total = args.numbers.reduce((acc, current) => acc + current, 0);
      return { total };
    },
  });
  registry.register({
    name: "multiply_numbers",
    description: "Multiply numbers for tests.",
    argsSchema: multiplyNumbersArgsSchema,
    execute: async (args): Promise<JsonObject> => {
      const product = args.numbers.reduce((acc, current) => acc * current, 1);
      return { product };
    },
  });
  registry.register({
    name: "to_uppercase",
    description: "Uppercase for tests.",
    argsSchema: toUpperCaseArgsSchema,
    execute: async (args): Promise<JsonObject> => {
      return { transformed: args.text.toUpperCase() };
    },
  });
  return registry;
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
