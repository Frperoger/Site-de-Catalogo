# Instalação e publicação

Documentação técnica para a pessoa responsável por configurar e manter a Biblioteca Particular. Execute os comandos na pasta principal do repositório.

Se o site já utiliza a v2, siga primeiro o [guia de atualização para a v3](ATUALIZAR-V3.md). A configuração de publicação deste repositório usa Node diretamente na Render.

## Preparar o Supabase

1. Crie um projeto no [Supabase](https://supabase.com/dashboard) no plano Free e guarde a senha do banco em local seguro.
2. No **SQL Editor**, execute o conteúdo completo de [`supabase/schema.sql`](../supabase/schema.sql). Ele cria as tabelas, as políticas de acesso, as funções e a biblioteca automática de cada usuário. Execute antes de cadastrar as contas do site.
3. Em **Project Settings > API**, copie a URL do projeto e a chave **publishable** ou **anon** pública. Nunca use `service_role`, `sb_secret_...` ou a senha do banco na aplicação.
4. Em **Authentication**, habilite login por email e senha. Mantenha a confirmação de email habilitada para o site publicado.
5. Em **Authentication > URL Configuration**, configure **Site URL** como `http://localhost:3000` para o primeiro teste e inclua `http://localhost:3000/` em **Redirect URLs**. Depois da publicação, altere **Site URL** para a URL HTTPS do Render e adicione a mesma URL, com `/` no final, em **Redirect URLs**. Mantenha o endereço local autorizado se continuar usando o ambiente local.
6. Configure **SMTP próprio** nas configurações de autenticação para enviar confirmação e recuperação às pessoas que usarão o site. O email padrão do Supabase é apenas para testes: só envia aos membros da equipe do projeto e tem limite reduzido. Consulte a [configuração oficial de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

A chave pública é entregue ao navegador para o login. A proteção dos dados depende das políticas RLS do arquivo SQL e da sessão de cada usuário; ocultar essa chave não substitui essas políticas.

## Executar no computador

Instale Node.js 22.13 ou superior da linha 22, ou Node.js 24, e execute na pasta do projeto:

```powershell
npm install
Copy-Item .env.example .env
```

Edite `.env` com a URL e a chave pública do seu projeto Supabase. Em seguida:

```powershell
npm start
```

Abra [http://localhost:3000](http://localhost:3000), crie uma conta, confirme o email e entre. Cada conta recebe sua biblioteca e se torna administradora dela. Use a mesma conta no celular após a publicação para acessar os mesmos dados.

Sem as variáveis do Supabase, o servidor pode entregar a tela de configuração pendente, mas o login e o catálogo remoto não estarão disponíveis. O arquivo `.env` e os backups são ignorados pelo Git.

## Aproveitar os livros do SQLite antigo

O arquivo `data/acervo.db` da versão anterior não é enviado ao Supabase automaticamente. Com Node.js 22.13 ou superior, gere um backup compatível usando o SQLite incluído no próprio Node, sem alterar o banco original:

```powershell
npm run exportar:sqlite
```

Isso cria `backup-local.json` usando somente o SQLite incluído no próprio Node, sem dependência nativa adicional. Para outros caminhos:

```powershell
node scripts/exportar-sqlite.js "C:\caminho\acervo.db" "C:\caminho\backup-migracao.json"
```

O comando recusa substituir um arquivo de saída existente. Depois, entre como administrador no site, selecione sua biblioteca e use **Restaurar backup**. Confira o resumo e a biblioteca de destino antes de confirmar: a restauração substitui o acervo e a personalização atuais dessa biblioteca. Mantenha uma cópia do SQLite original e de um backup da biblioteca de destino.

## Publicar inicialmente no Render Free

O repositório inclui [`render.yaml`](../render.yaml), que declara um único serviço web Node no plano **free**, sem banco ou disco pago. O banco usado pelo site é o Supabase.

1. Envie esta versão do projeto ao repositório [Frperoger/Site-de-Catalogo](https://github.com/Frperoger/Site-de-Catalogo) em uma branch que você queira publicar.
2. Crie/acesse sua conta no [Render](https://dashboard.render.com), conecte o GitHub e autorize o acesso a esse repositório.
3. Escolha **New > Blueprint**, selecione o repositório e a branch, e use `render.yaml`.
4. Quando solicitado, preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` com os valores públicos do mesmo projeto. Confira que o plano continua **Free** antes de criar o serviço.
5. Aguarde a instalação e o início do servidor. O Render usa `npm ci --omit=dev`, `npm start` e o caminho de verificação `/api/health`. Não acrescente `--omit=optional`: os componentes de tratamento de imagens precisam ser instalados.
6. Copie a URL HTTPS gerada pelo Render. Atualize **Site URL** e **Redirect URLs** no Supabase conforme as instruções anteriores.
7. Teste cadastro, confirmação e recuperação de senha na URL publicada. Entre em duas contas distintas para verificar que cada uma vê o próprio acervo. Compartilhe uma delas como visualizadora e confira que não há ações de edição.
8. Abra a mesma URL no celular, faça login com sua conta e confira os dados. Baixe e restaure um backup em uma biblioteca de teste antes de depender dele.

Se preferir criar o serviço manualmente, escolha **Web Service**, runtime **Node**, plano **Free**, os mesmos comandos e variáveis acima, e health check `/api/health`.

O arquivo `.node-version` seleciona Node 22 para serviços criados manualmente. Se a Render já tiver a variável `NODE_VERSION`, ela tem prioridade: configure seu valor como `22`. Após atualizar esta versão, use **Manual Deploy > Clear build cache & deploy** se uma instalação antiga ainda tentar compilar `better-sqlite3`.

O plano gratuito do Render suspende o servidor após 15 minutos sem tráfego e a primeira visita seguinte pode demorar para abrir. Há limites de horas, transferência e builds; o sistema de arquivos é temporário. Por isso os dados ficam no Supabase. Consulte os [limites atuais do Render Free](https://render.com/docs/free). O Supabase Free também pode pausar projetos com pouca atividade; veja [pausa de projetos](https://supabase.com/docs/guides/platform/free-project-pausing). A configuração é adequada para começar, sem promessa de disponibilidade contínua.

O arquivo de hospedagem prepara a publicação, mas não cria contas, não aplica o SQL no Supabase e não publica sozinho. Essas etapas dependem do acesso do proprietário aos painéis Render, GitHub e Supabase. Nenhum segredo desses serviços deve ser adicionado ao repositório.

## Estrutura

Para verificar as permissões e a restauração antes de publicar, execute `npm test`. Os testes do banco usam PostgreSQL em memória e não acessam nem alteram seu projeto Supabase.

```text
public/                    Interface responsiva e autenticação
lib/                       Preparação de imagens e rotas de visitante/convites
server.js                  API Express e verificação de sessão/permissões
db.js                      Consultas ao Supabase limitadas à biblioteca
supabase/schema.sql        Banco, políticas RLS e funções transacionais
supabase/migrations/        Atualização de instalações existentes
docs/                      Instalação e atualização do site
tests/                     Testes locais de acesso, imagens e restauração
scripts/exportar-sqlite.js Conversor somente de leitura do banco antigo
render.yaml                Serviço gratuito no Render
.env.example               Modelo de configuração local
```
