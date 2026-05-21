import { z } from 'zod';

export const UserRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const UserLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const SelectorFieldSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
    message: 'Field name must be a valid database column identifier (alphanumeric and underscores, starting with letter/underscore)'
  }),
  selector: z.string().min(1),
  type: z.enum(['text', 'attr', 'html']),
  attr: z.string().optional(),
});

export const PaginationConfigSchema = z.object({
  type: z.enum(['next_button', 'url_pattern', 'infinite_scroll']),
  selector: z.string().optional(),
  urlTemplate: z.string().optional(),
  maxPages: z.number().int().positive().max(100),
});

export const TaskConfigSchema = z.object({
  startUrl: z.string().url(),
  pagination: PaginationConfigSchema,
  fields: z.array(SelectorFieldSchema).nonempty(),
  rateLimitMs: z.number().int().nonnegative().optional(),
  useProxy: z.boolean().optional(),
});

export const CreateTaskSchema = z.object({
  name: z.string().min(1).max(255),
  config: TaskConfigSchema,
  scheduleCron: z.string().nullable().optional(),
});

export const UpdateTaskSchema = CreateTaskSchema.partial();
