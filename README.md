# Site de Catálogo – Biblioteca Particular

Catálogo para organizar livros: busca, filtros, status de leitura, favoritos, avaliação, controle de empréstimos, consulta por ISBN e exportação em `.doc`.

Feito com Node.js, Express e SQLite. Com Docker, funciona em qualquer computador sem instalar mais nada.

## O que você precisa

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows, Mac ou Linux)

Depois de instalar o Docker Desktop, abra o programa e espere ele indicar que está em execução.

## Como baixar e rodar

```bash
Abra o repositório na sua IDE
cd Site-de-Catalogo
docker compose up --build
```

Quando aparecer a mensagem `Biblioteca rodando em http://localhost:3000`, abra no navegador:

**http://localhost:3000**

Na primeira vez, o catálogo já vem com alguns livros de exemplo.

## Comandos úteis

| O que fazer | Comando |
|---|---|
| Rodar em segundo plano | `docker compose up -d` |
| Parar o site | `docker compose down` |
| Ver os logs | `docker compose logs -f` |

Para parar com o site rodando no terminal, use `Ctrl + C`.

## Onde ficam os dados

Os livros ficam em um banco SQLite guardado em um volume do Docker (`biblioteca-data`). Os dados **continuam existindo** mesmo se você parar ou recriar o container.

Para apagar tudo e começar do zero:

```bash
docker compose down -v
```

Esse comando remove o volume e todos os livros cadastrados. Use só se tiver certeza.

## Problemas comuns

**A porta 3000 já está em uso.** Edite o arquivo `docker-compose.yml` e troque o primeiro número da linha de portas, por exemplo `"8080:3000"`. Depois acesse `http://localhost:8080`.

**`docker: command not found` ou erro de conexão com o Docker.** O Docker Desktop não está aberto. Abra o programa e tente de novo.

**A busca por ISBN não encontra o livro.** A consulta usa a Open Library e precisa de internet. Se o ISBN não existir lá, preencha os dados manualmente.

## Rodar sem Docker (opcional)

Precisa do Node.js 18 ou superior:

```bash
npm install
npm start
```

Depois abra `http://localhost:3000`.
