// Elementos do DOM
const elements = {
    fileInput: document.getElementById('file-input'),
    analyzeButton: document.getElementById('analyze-button'),
    preview: document.getElementById('preview'),
    result: document.getElementById('result'),
    loading: document.querySelector('.loading'),
    error: document.getElementById('error-message'),
    copyButton: document.getElementById('copy-button'),
    downloadButton: document.getElementById('download-button'),
    dropArea: document.getElementById('drop-area'),
    fileName: document.getElementById('file-name'),
    formattedData: document.getElementById('formatted-data'),
    buttonGroup: document.querySelector('.button-group')
};

// Configuração da API
const API_CONFIG = {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    key: ''
};

// Event Listeners
elements.fileInput.addEventListener('change', handleFileSelect);
elements.analyzeButton.addEventListener('click', handleAnalyzeClick);
elements.copyButton.addEventListener('click', handleCopyClick);
elements.downloadButton.addEventListener('click', handleDownloadClick);

// Drag and Drop handlers
elements.dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropArea.classList.add('dragover');
});

elements.dropArea.addEventListener('dragleave', () => {
    elements.dropArea.classList.remove('dragover');
});

elements.dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect({ target: { files: [file] } });
});

// Handlers
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        if (!isValidFileType(file)) {
            showError('Tipo de arquivo não suportado. Por favor, use uma imagem (JPEG, PNG ou GIF).');
            return;
        }

        if (!isValidFileSize(file)) {
            showError('Arquivo muito grande. O tamanho máximo permitido é 5MB.');
            return;
        }

        elements.fileName.textContent = file.name;
        elements.analyzeButton.disabled = false;
        showPreview(file);
    }
}

async function handleAnalyzeClick() {
    const file = elements.fileInput.files[0];
    if (file) {
        try {
            showLoading(true);
            const base64Image = await fileToBase64(file);
            console.log('Enviando imagem para análise...');
            const response = await analyzeDocument(base64Image);
            console.log('Resposta da API:', response);
            showResult(response);
        } catch (error) {
            console.error('Erro detalhado:', error);
            showError(`Erro ao analisar o documento: ${error.message}`);
        } finally {
            showLoading(false);
        }
    }
}

function handleCopyClick() {
    navigator.clipboard.writeText(elements.result.textContent)
        .then(() => {
            const originalText = elements.copyButton.textContent;
            elements.copyButton.textContent = 'Copiado!';
            setTimeout(() => {
                elements.copyButton.textContent = originalText;
            }, 2000);
        })
        .catch(err => {
            console.error('Erro ao copiar:', err);
            showError('Erro ao copiar o texto. Por favor, tente novamente.');
        });
}

function handleDownloadClick(e) {
    try {
        const jsonData = elements.result.textContent;
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        elements.downloadButton.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
        e.preventDefault();
        console.error('Erro ao criar arquivo:', error);
        showError('Erro ao criar arquivo para download.');
    }
}

// Funções principais
async function analyzeDocument(base64Image) {
    try {
        console.log('Iniciando chamada da API...');
        const response = await fetch(`${API_CONFIG.url}?key=${API_CONFIG.key}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: "Analise esta imagem de documento (que pode ser RG, CPF, CNH, Certidão de Nascimento, Certidão de Casamento ou registro de CNPJ) e retorne um JSON com os seguintes campos obrigatórios: nome, dataNascimento, nacionalidade, naturalidade, sexo, rg, cpf, nomePai, nomeMae, endereco, cidade, estado, cep. Para CNH adicione: numeroRegistro, dataValidade, categoria. Para Certidão de Casamento adicione: nomeConjuge, dataRegistro, cartorio. Para CNPJ adicione: razaoSocial, nomeFantasia, cnpj, dataAbertura, atividadePrincipal. Se algum campo não for encontrado ou não se aplicar ao tipo de documento, deixe como string vazia."
                        },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: base64Image
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topP: 1,
                    topK: 32
                }
            })
        });

        console.log('Status da resposta:', response.status);
        const data = await response.json();
        console.log('Dados da resposta:', data);

        if (!response.ok) {
            throw new Error(data.error?.message || 'Erro na chamada da API');
        }

        if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
            throw new Error('Resposta da API em formato inválido');
        }

        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Erro na análise:', error);
        throw error;
    }
}

// Funções auxiliares
function showPreview(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        elements.preview.src = e.target.result;
        elements.preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function showLoading(show) {
    elements.loading.style.display = show ? 'block' : 'none';
    elements.error.style.display = 'none';
    elements.analyzeButton.disabled = show;
}

function showError(message) {
    elements.error.textContent = message;
    elements.error.style.display = 'block';
    elements.loading.style.display = 'none';
    elements.result.style.display = 'none';
    elements.buttonGroup.style.display = 'none';
    elements.formattedData.style.display = 'none';
}

function showResult(data) {
    try {
        console.log('Formatando resultado:', data);
        let jsonData;
        
        // Tenta extrair JSON da string se necessário
        if (typeof data === 'string') {
            // Procura por um objeto JSON válido na string
            const matches = data.match(/\{[\s\S]*\}/);
            if (matches) {
                jsonData = JSON.parse(matches[0]);
            } else {
                // Se não encontrar JSON válido, cria um objeto com o texto
                jsonData = { texto: data };
            }
        } else {
            jsonData = data;
        }

        // Exibe o JSON formatado
        const formattedJson = JSON.stringify(jsonData, null, 2);
        elements.result.textContent = formattedJson;
        elements.result.style.display = 'block';
        elements.buttonGroup.style.display = 'flex';
        
        // Exibe os dados formatados
        displayFormattedData(jsonData);
        
        elements.error.style.display = 'none';
    } catch (error) {
        console.error('Erro ao formatar dados:', error);
        showError('Erro ao formatar os dados. Por favor, tente novamente.');
    }
}

function displayFormattedData(data) {
    elements.formattedData.style.display = 'block';
    elements.formattedData.innerHTML = '<h2>Dados Extraídos</h2>';

    // Cria uma lista formatada com os dados
    const dataList = document.createElement('div');
    dataList.className = 'data-list';

    Object.entries(data).forEach(([key, value]) => {
        if (value && typeof value === 'object') {
            // Para objetos aninhados
            const section = document.createElement('div');
            section.className = 'data-section';
            section.innerHTML = `<h3>${formatKey(key)}</h3>`;
            
            Object.entries(value).forEach(([subKey, subValue]) => {
                if (subValue) {
                    const item = document.createElement('div');
                    item.className = 'data-item';
                    item.innerHTML = `
                        <span class="data-label">${formatKey(subKey)}:</span>
                        <span class="data-value">${subValue}</span>
                    `;
                    section.appendChild(item);
                }
            });
            
            dataList.appendChild(section);
        } else if (value) {
            // Para valores simples
            const item = document.createElement('div');
            item.className = 'data-item';
            item.innerHTML = `
                <span class="data-label">${formatKey(key)}:</span>
                <span class="data-value">${value}</span>
            `;
            dataList.appendChild(item);
        }
    });

    elements.formattedData.appendChild(dataList);
}

function formatKey(key) {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

function isValidFileType(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    return allowedTypes.includes(file.type);
}

function isValidFileSize(file) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    return file.size <= maxSize;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
