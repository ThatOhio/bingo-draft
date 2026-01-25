import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting migration to Discord OAuth...')

  // This migration will be handled by Prisma migrate
  // But we can add any data transformations here if needed

  console.log('Migration complete!')
  console.log('Please run: npm run db:migrate')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
