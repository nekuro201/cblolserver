import { FastifyInstance } from "fastify"
import ShortUniqueId from "short-unique-id"
import { z } from "zod"
import { prisma } from "../lib/prisma"
import { authenticate } from "../plugins/authenticate"

export async function poolRoutes(fastify: FastifyInstance) {
  fastify.get('/polls/count', async () => {
    const count = await prisma.poll.count()

    return { count }
  })

  // rota com post para criar um bolao
  fastify.post('/polls', async (request, reply) => {
    try {
      const createPollBody = z.object({
        title: z.string(),
      })

      const { title } = createPollBody.parse(request.body)

      const gerenate = new ShortUniqueId({ length: 6 })
      const code = String(gerenate()).toUpperCase();

      try {
        await request.jwtVerify()

        // se chegar aqui eh pq tem user authenticado
        await prisma.poll.create({
          data: {
            title,
            code,
            ownerId: request.user.sub,

            participants: {
              create: {
                userId: request.user.sub,
              }
            }
          }
        })
      } catch {
        // criando sem user authenticado
        await prisma.poll.create({
          data: {
            title,
            code: code
          }
        })
      }
      
      return reply.status(201).send({ code })
    }
    catch(e) {
      return reply.status(500).send({e})
    }
  })

  // dois pontos antes de id, diz q espera uma informacao dinamica
  fastify.post('/polls/join', {
    onRequest: [authenticate]
  }, async (request, reply) => {
    // essa rota eh acessivel apenas se o user estiver logado
    const joinPollBody = z.object({
      code: z.string(),
    })

    const { code } = joinPollBody.parse(request.body)

    const poll = await prisma.poll.findUnique({
      where: {
        code,
      },
      include: {
        participants: {
          where: {
            userId: request.user.sub,
          }
        }
      }
    })

    if(!poll){
      // 400 = erro generico
      return reply.status(400).send({
        message: "Poll not found."
      })
    }

    if(poll.participants.length > 0){
      return reply.status(400).send({
        message: "You already joined this poll."
      })
    }

    // se nao tiver dono, tirar isso quando tiver login na pagina web
    if(!poll.ownerId){
      await prisma.poll.update({
        where: {
          id: poll.id,
        },
        data: {
          ownerId: request.user.sub,
        }
      })
    }

    await prisma.participant.create({
      data: {
        pollId: poll.id,
        userId: request.user.sub,
      }
    })

    // 201 - sucesso, criou um novo recurso
    return reply.status(201).send()
  })

  // rota com get para buscar todos os boloes que user esta participando
  fastify.get('/polls', {
    onRequest: [authenticate]
  }, async (request) => {
    const polls = await prisma.poll.findMany({
      where: {
        participants: {
          some: {
            userId: request.user.sub,
          }
        }
      },
      include: {
        _count: {
          select: {
            participants: true,
          }
        },
        participants: {
          select: {
            id: true,

            user: {
              select: {
                avatarUrl: true,
              }
            }
          },
          take: 4,
        },

        // owner: true, // todas as informacoes do dono junto
        owner: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    })

    return { polls }
  })

  // buscando um bolao (detalhes)
  fastify.get('/polls/:id', {
    onRequest: [authenticate]
  }, async (request) => {
    const getPollParams = z.object({
      id: z.string(),
    })

    const { id } = getPollParams.parse(request.params)

    const poll = await prisma.poll.findUnique({
      where: {
        id,
      },
      include: {
        _count: {
          select: {
            participants: true,
          }
        },
        participants: {
          select: {
            id: true,

            user: {
              select: {
                avatarUrl: true,
              }
            }
          },
          take: 4,
        },

        // owner: true, // todas as informacoes do dono junto
        owner: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    })

    return { poll }
  })
}