# Site da Mila Ruela · Psicóloga

Site de uma página só, em HTML, CSS e um pouco de JavaScript. Não usa framework nem etapa de "build" e não precisa de servidor: basta publicar os arquivos como estão.

## Versões

- `/` — versão principal (minimalista): uma fonte só (Inter Tight), fundo claro e frio, sem cartões nem botões cheios, navegação com só o nome e "Agendar". O vermelho aparece só na linha, desenhada ao vivo pelo `js/linha-viva.js`.
- `/v1/` — primeira versão (creme, serifa, cartões), guardada para referência. Não aparece no Google.
- `/v2/` — endereço antigo da versão minimalista; redireciona para `/`.

## Estrutura

```
index.html             todo o conteúdo da página (textos, seções, links)
css/estilo.css         cores, fonte e layout
js/linha-viva.js       desenha a linha vermelha ao vivo (comentado)
dados/rota-linha.json  percurso desenhado à mão, usado como espinha da linha no computador
img/                   fotos (em .webp e .jpg), favicon e imagem de compartilhamento (og.jpg)
fontes/                fontes hospedadas no próprio site (sem Google Fonts)
v1/                    primeira versão, para referência
```

## Antes de publicar de verdade: trocar os campos entre colchetes

Procure no `index.html` (Ctrl+F) e substitua:

| Procure | Troque por |
|---|---|
| `55XXXXXXXXXXX` | WhatsApp com DDI e DDD, só números. Ex.: `5531999998888` (aparece 3 vezes) |
| `query=Ouro+Preto%2C+Belo+Horizonte+MG` | o endereço do consultório, para o link "Ver no mapa" |
| `[NÚMERO]` | número do CRP (aparece 3 vezes) |
| `[usuario]` | usuário do Instagram |
| `[Endereço completo]` | endereço do consultório |
| `[Instituição]`, `[ano]`, `[Outras especializações ou cursos]` | formação |
| `[Rascunho: …]` | o parágrafo do "Sobre mim" na voz da Mila |
| `[50]` | duração da sessão |
| `[Confirmar]` | apagar depois de confirmar a resposta sobre convênio |
| `https://SEU-DOMINIO/` | o domínio definitivo |

A mensagem que já vem escrita no WhatsApp está no próprio link, depois de `?text=`. Para mudar o texto, gere um link novo em https://wa.me/ ou troque os espaços por `%20`.

## Editar textos

Todo o texto está no `index.html`, na ordem em que aparece na página, com comentários marcando cada seção (`<!-- ===== Sobre mim ===== -->`). A linha vermelha se ajusta sozinha se um texto ficar maior ou menor.

## Trocar uma foto

Coloque a nova foto em `img/` com o mesmo nome e tamanho aproximado. Se puder, gere as versões `.webp` (por exemplo em https://squoosh.app) e substitua as duas: `.jpg` e `.webp`.

## Cores e fontes

As cores ficam no começo do `css/estilo.css`, em `:root`. O vermelho da linha e dos botões é `--vermelho`.

## Ver no computador

O navegador bloqueia o carregamento do percurso da linha quando o arquivo é aberto direto com duplo clique. Para ver com a linha, rode na pasta do site:

```
python3 -m http.server 8000
```

e abra http://localhost:8000.

## Publicar

**GitHub Pages (onde está agora):** Settings → Pages → Source: "Deploy from a branch" → Branch `main`, pasta `/ (root)`. O endereço fica `https://lucasdcosendey.github.io/milaruela/`. Cada `git push` atualiza o site em cerca de um minuto.

**Vercel ou Netlify (alternativa):** importe o repositório e deixe as configurações vazias: não há build. Os dois têm plano gratuito.

## Domínio próprio

1. Registre o domínio em https://registro.br. Opções: `milaruela.com.br`, ou `milaruela.psi.br` (a categoria `.psi.br` é para psicólogos e exige CRP ativo).
2. No GitHub Pages: Settings → Pages → Custom domain → digite o domínio. O GitHub cria um arquivo `CNAME` no repositório.
3. No Registro.br, em "Editar zona" (DNS), crie:
   - quatro registros `A` para o domínio, apontando para `185.199.108.153`, `185.199.109.153`, `185.199.110.153` e `185.199.111.153`;
   - um `CNAME` para `www`, apontando para `lucasdcosendey.github.io`.
4. Depois que o DNS propagar (de minutos a algumas horas), marque "Enforce HTTPS".
5. Troque `https://SEU-DOMINIO/` no `index.html` pelo domínio.

Os IPs acima são os indicados pelo GitHub. Confira na documentação do GitHub Pages ("Managing a custom domain") antes de configurar.

## A linha vermelha

Tudo fica no `js/linha-viva.js`, comentado, com os principais ajustes no começo do arquivo (transparência sobre o texto, ritmo da ponta, altura da tela em que ela trabalha).

- Um só começo (no topo) e um só fim (saindo pela base). Ela só se ramifica em lagos, que sempre voltam a se juntar.
- **Computador:** a espinha é o percurso desenhado à mão em `dados/rota-linha.json`, preso às seções da página, com os seus lagos. Cada visita ganha pequenos desvios sorteados em volta dele.
- **Celular:** a curva é sorteada a cada visita, de preferência pelos espaços vazios.
- **Desenhada ao vivo:** a ponta aparece na tela, com um pingo de tinta, e avança no ritmo de uma mão. Ler devagar engrossa o traço; uma pausa abre um lago logo adiante.
- **Sobre textos e fotos** a linha fica quase transparente e mais fina, com transição suave, em vez de desviar.
- Quem pede ao sistema para reduzir movimento vê a linha pronta.
- **Se uma seção for adicionada ou removida**, o celular se ajusta sozinho; no computador, o percurso desenhado precisa ser refeito (hoje são 9 blocos: cabeçalho, 7 seções e rodapé).

## Ética e publicidade (CFP)

O texto segue as orientações do CFP para publicidade de psicólogos: nome e CRP visíveis, sem depoimentos de pacientes, sem promessa de resultado e sem preço como chamariz. Vale revisar com a Cartilha de Publicidade Profissional do CRP-MG antes de divulgar. Para atender online, é preciso ter cadastro no e-Psi do CFP.
