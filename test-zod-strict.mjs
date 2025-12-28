import { z } from 'zod';

const schema = z.object({
  userAgent: z.string().optional(),
  proxy: z.string().optional(),
}).strict();

console.log('Test 1 (valid):', schema.safeParse({ userAgent: 'test' }));
console.log('Test 2 (invalid field):', schema.safeParse({ options: 'invalid' }));
