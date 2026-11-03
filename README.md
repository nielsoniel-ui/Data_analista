# 🇲🇿 Data Analista - Inteligência e Análise de Dados para Moçambique

Plataforma moderna, minimalista e interativa de análise de dados ("AI Data Analyst") desenvolvida para negócios, analistas e gestores em Moçambique.

![Data Analista](./AI%20Data%20analyst.png)

---

## 🚀 Funcionalidades

1. **Autenticação e Gestão de Contas:**
   - **Tela de Iniciar Sessão (`login.html`):** Autenticação por e-mail/palavra-passe, botões rápidos SSO (Google Workspace e Microsoft 365), opção de lembrar sessão e recuperação.
   - **Tela de Registo (`register.html`):** Registo de novos profissionais e organizações, seleção de províncias de Moçambique (Maputo, Sofala, Nampula, etc.), indicador dinâmico de força de palavra-passe e conformidade com privacidade.
   - **Sessão Persistente:** O cabeçalho reconhece o utilizador autenticado e exibe o seu nome e opção de terminar sessão.

2. **Upload e Conexão de Dados (Etapa 1):**
   - Suporte a múltiplos ficheiros CSV (`≤ 1MB`) com drag-and-drop.
   - Integração para grandes bases de dados na nuvem (Google Cloud Storage / URLs).
   - Visualização e remoção de ficheiros adicionados.

3. **Instruções Estratégicas de Negócio (Etapa 2):**
   - Campo para inserção de perguntas e instruções em língua portuguesa.
   - Pílulas de prompts sugeridos (resumo de tendências, segmentos, análise de outliers/anomalias).

4. **Agente de IA e Log de Atividades (Analytics Agent):**
   - Acompanhamento do raciocínio passo a passo do agente (`Agent Activity`).
   - Diagnósticos gerenciais em português com recomendações de stock, ticket médio e fidelização de clientes (ex.: Ana Cossa, João Sitoe).
   - Chat interativo para perguntas de acompanhamento (*follow-up*).

5. **Dashboard Executivo Automático:**
   - **Indicadores Chave (KPIs):** Vendas totais em Meticais (MT), quantidades comercializadas e destaques por cidades (Maputo, Boane, Matola).
   - **Visualizações Interativas (Gráficos):** Gráfico de barras por região e gráfico de linha com evolução mensal de faturação.
   - **Tabelas de Dados:** Listagem estruturada de produtos, quantidades e volume financeiro.
   - **Exportação:** Botão para download de relatório em PDF e JSON.

---

## 🗄️ Base de Dados & Autenticação (MongoDB Atlas)

A aplicação está configurada com base de dados **MongoDB Atlas** (`datanalistadb`):
- **String de Conexão:** `mongodb+srv://nielsoniel_db_user:***@cluster0.efcyoe3.mongodb.net/`
- **Base de Dados:** `datanalistadb`
- **Coleção de Utilizadores:** `users`

### Credenciais dos Utilizadores de Demonstração
- **Administrador:**
  - **E-mail:** `admin@dataanalista.com`
  - **Palavra-passe:** `@nalista`
  - **Perfil:** `admin` &bull; Redireciona para o **Painel do Administrador** (`admin.html`)
- **Cliente:**
  - **E-mail:** `cliente@dataanalista.com`
  - **Palavra-passe:** `cli3nte`
  - **Perfil:** `client` &bull; Redireciona para o **Painel Executivo do Cliente** (`client.html`)

Para sincronizar ou criar utilizadores no MongoDB Atlas:
```bash
python scripts/create_admin.py
python scripts/create_client.py
```

---

## 📊 Dashboards Dedicados

1. **Dashboard do Administrador (`admin.html`):**
   - Monitorização de utilizadores ativos em Moçambique e volume de dados processados.
   - Gestão de contas da coleção `users` com pesquisa, suspensão e criação de utilizadores.
   - Estado de saúde e latência da infraestrutura MongoDB Atlas.
   - Gráficos de volume diário de consultas de IA e distribuição geográfica por províncias.

2. **Dashboard do Cliente (`client.html`):**
   - Indicadores de faturamento consolidado em Meticais (MT), ticket médio e encomendas.
   - Gráficos de vendas realizadas vs meta projetada e vendas por categoria de produto.
   - Lista de bases de dados e ficheiros CSV enviados pela empresa com atalho para consulta direta ao agente de IA.
   - Diagnósticos e recomendações executivas para aumento de receita.

---

## 🛠️ Tecnologias Utilizadas

- **HTML5 & CSS3**
- **[Tailwind CSS](https://tailwindcss.com/)**
- **[Lucide Icons](https://lucide.dev/)**
- **[Chart.js](https://www.chartjs.org/)**
- **[MongoDB Atlas](https://www.mongodb.com/)**
- **[Python (PyMongo & Bcrypt)](https://pymongo.readthedocs.io/)**

---

## 💻 Como Executar Localmente

Não requer instalação de dependências ou build:
1. Clone o repositório:
   ```bash
   git clone https://github.com/nielsoniel-ui/Data_analista.git
   cd Data_analista
   ```
2. Abra qualquer um dos ficheiros no navegador:
   - `index.html` - Espaço de Trabalho & Dashboard
   - `login.html` - Tela de Iniciar Sessão
   - `register.html` - Tela de Registo de Conta
