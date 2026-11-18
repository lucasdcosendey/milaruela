# Site da Mila Ruela · Psicóloga

Site de uma página só, em HTML, CSS e um pouco de JavaScript. Não usa framework nem etapa de "build" e não precisa de servidor: basta publicar os arquivos como estão.

## Estrutura

```
index.html            todo o conteúdo da página (textos, seções, links)
css/estilo.css        cores, fontes e layout
js/linha.js           desenha a linha vermelha e desvia dela em volta dos textos
dados/rota-linha.json percurso da linha vermelha
img/                  fotos (em .webp e .jpg), favicon e imagem de compartilhamento (og.jpg)
fontes/               Fraunces e DM Sans, hospedadas no próprio site (sem Google Fonts)
```

## Antes de publicar de verdade: trocar os campos entre colchetes

Procure no `index.html` (Ctrl+F) e substitua:

| Procure | Troque por |
|---|---|
| `55XXXXXXXXXXX` | WhatsApp com DDI e DDD, só números. Ex.: `5531999998888` (aparece 4 vezes) |
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

O navegador bloqueia o carregamento da linha quando o arquivo é aberto direto com duplo clique. Para ver com a linha, rode na pasta do site:

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

Tudo fica no `js/linha.js`, comentado.

- **Computador (1000 px ou mais):** segue o percurso desenhado à mão, que fica em `dados/rota-linha.json`. O percurso é preso às seções, então a linha acompanha se uma seção crescer. Os trechos marcados como "fixos" seguem o desenho exatamente. O resto desvia sozinho em volta dos textos.
- **Celular e tablet:** a linha corre pelas margens e troca de lado nos espaços entre as seções. Numa das travessias ela se abre num "lago". O lado em cada seção fica na constante `LADOS_CELULAR`, e a travessia com lago em `LAGO_NA_TRAVESSIA`.
- **Animação:** o traço se desenha conforme a rolagem e fica sempre um pouco abaixo do fim da tela, então a linha nunca aparece interrompida no que está visível. O que já foi desenhado não se apaga ao subir. Quem pede ao sistema para reduzir movimento vê a linha pronta.
- **Se uma seção for adicionada ou removida**, o celular se ajusta sozinho (basta acrescentar o lado em `LADOS_CELULAR`). No computador, o percurso desenhado precisa ser refeito.

## Ética e publicidade (CFP)

O texto segue as orientações do CFP para publicidade de psicólogos: nome e CRP visíveis, sem depoimentos de pacientes, sem promessa de resultado e sem preço como chamariz. Vale revisar com a Cartilha de Publicidade Profissional do CRP-MG antes de divulgar. Para atender online, é preciso ter cadastro no e-Psi do CFP.
