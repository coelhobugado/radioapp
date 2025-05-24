const API_BASE_URL = 'https://de1.api.radio-browser.info/json';
        const USER_AGENT = 'RadioOnlineWebApp/1.0 (seu_email@example.com)';
        const ITEMS_PER_PAGE = 20;
        const DEBOUNCE_DELAY = 500;

        const searchInput = document.getElementById('search-input');
        const searchButton = document.getElementById('search-button');
        const favoritesButton = document.getElementById('favorites-button');
        const clearFiltersButton = document.getElementById('clear-filters-button');
        const countryFilter = document.getElementById('country-filter');
        const languageFilter = document.getElementById('language-filter');
        const tagFilter = document.getElementById('tag-filter');
        const sortOptions = document.getElementById('sort-options');
        const radioGrid = document.getElementById('radio-grid');
        const loading = document.getElementById('loading');
        const pagination = document.getElementById('pagination');
        const player = document.getElementById('player');
        const audioPlayer = document.getElementById('audio-player');
        const currentStation = document.getElementById('current-station');
        const currentInfo = document.getElementById('current-info');
        const stopButton = document.getElementById('stop-button');
        const volumeControl = document.getElementById('volume');
        const volumeIconContainer = document.getElementById('volume-icon-container');
        const playPauseButton = document.getElementById('play-pause-button');
        const errorToast = document.getElementById('error-toast');
        const errorToastText = document.getElementById('error-message-text');

        let currentPage = 1;
        let totalStations = 0;
        let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
        let showingFavorites = false;
        let stations = [];
        let currentStationIndex = -1;
        let currentPlayingCard = null;

        const filters = {
            name: '',
            country: '',
            language: '',
            tagList: '',
            order: 'name',
            reverse: false,
            offset: 0,
            limit: ITEMS_PER_PAGE,
            hidebroken: true
        };

        function debounce(func, delay) {
            let timeout;
            return function(...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), delay);
            };
        }

        function displayError(message) {
            errorToastText.textContent = message;
            errorToast.classList.add('active');
            setTimeout(() => {
                errorToast.classList.remove('active');
            }, 5000);
        }

        function displayPlaybackError(message) {
            displayError(`Erro de reprodução: ${message}`);
        }

        function showLoading(show) {
            if (show) {
                loading.style.display = 'flex';
                setTimeout(() => loading.classList.add('active'), 10);
                radioGrid.innerHTML = '';
                pagination.innerHTML = '';
            } else {
                loading.classList.remove('active');
                setTimeout(() => {
                    loading.style.display = 'none';
                }, 300);
            }
        }

        function showNoResultsMessage(message) {
            radioGrid.innerHTML = `
                <div class="no-results active">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-frown"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/></svg>
                    <h3>${message}</h3>
                </div>
            `;
            pagination.innerHTML = '';
        }

        function updateVolumeIcon(volume) {
            let iconSvg = '';
            if (volume == 0) {
                iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-x"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/></svg>`;
            } else if (volume < 0.5) {
                iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-1"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
            } else {
                iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-volume-2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
            }
            volumeIconContainer.innerHTML = iconSvg;
        }

        async function fetchData(endpoint, params = {}) {
            let url; 
            try {
                url = new URL(`${API_BASE_URL}${endpoint}`);
                Object.entries(params).forEach(([key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        url.searchParams.append(key, value);
                    }
                });

                const response = await fetch(url.toString(), {
                    headers: { 'User-Agent': USER_AGENT }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const errorMessage = `Erro na requisição da API (${response.status}) para URL: ${url.toString()}. Resposta: ${errorText || '(Sem resposta no corpo)'}`;
                    console.error(errorMessage);
                    throw new Error(response.status === 404 ? `Recurso não encontrado em: ${url.toString()}` : errorMessage);
                }

                return await response.json();
            } catch (error) {
                if (error instanceof TypeError) { 
                    console.error(`Erro de rede ao tentar acessar: ${url ? url.toString() : API_BASE_URL + endpoint}`, error);
                    displayError(`Erro de rede ao buscar dados. Verifique sua conexão.`);
                    return []; 
                }
                console.error('Erro ao buscar dados:', error);
                displayError(`Falha ao carregar dados: ${error.message}.`);
                return [];
            }
        }

        async function trackStationClick(stationuuid) {
            if (!stationuuid || typeof stationuuid !== 'string' || stationuuid.trim() === '') {
                console.warn('Tentativa de rastrear clique com stationuuid inválido:', stationuuid);
                return;
            }
            try {
                const response = await fetch(`${API_BASE_URL}/url/${stationuuid}`, { // URL verified
                    method: 'HEAD',
                    headers: { 'User-Agent': USER_AGENT }
                });
                // Even if response.ok is false (like 404), we might not want to throw an error here
                // as it's a background task. Logging is sufficient.
                if (!response.ok) {
                    console.log(`Resposta não OK (${response.status}) ao rastrear clique para: ${stationuuid}`);
                }
            } catch (error) {
                if (error.message.includes('404') || (error instanceof Error && error.message.toLowerCase().includes('not found'))) {
                    console.log(`API não encontrou recurso para rastrear clique: ${stationuuid} (Erro 404)`);
                } else {
                    console.error('Erro ao registrar clique na estação:', stationuuid, error);
                }
            }
        }

        async function loadFilters() {
            try {
                const [countries, languages, tags] = await Promise.all([
                    fetchData('/countries'),
                    fetchData('/languages'),
                    fetchData('/tags')
                ]);

                populateSelect(countryFilter, countries, 'name');
                populateSelect(languageFilter, languages, 'name');
                populateSelect(tagFilter, tags.filter(tag => tag.name.trim() !== '' && tag.stationcount > 5)
                                            .sort((a, b) => b.stationcount - a.stationcount)
                                            .slice(0, 50),
                            'name');
                tagFilter.multiple = true;

            } catch (error) {
                console.error("Erro ao carregar filtros:", error);
            }
        }

        function populateSelect(selectElement, data, valueProperty) {
            selectElement.innerHTML = '';
            const firstOption = document.createElement('option');
            firstOption.value = '';
            let optionText = 'Todos';
            if (selectElement.id === 'country-filter') optionText += ' os Países';
            else if (selectElement.id === 'language-filter') optionText += ' os Idiomas';
            else if (selectElement.id === 'tag-filter') optionText += ' os Gêneros';

            firstOption.textContent = optionText;
            selectElement.appendChild(firstOption);

            data.forEach(item => {
                const option = document.createElement('option');
                option.value = item[valueProperty];
                option.textContent = item[valueProperty] + (item.stationcount ? ` (${item.stationcount})` : '');
                selectElement.appendChild(option);
            });
        }

        function updateFilters() {
            const selectedTags = Array.from(tagFilter.selectedOptions).map(option => option.value).join(',');

            filters.name = searchInput.value;
            filters.country = countryFilter.value;
            filters.language = languageFilter.value;
            filters.tagList = selectedTags;
            filters.order = sortOptions.value;
            filters.reverse = filters.order === 'votes' || filters.order === 'clicks' || filters.order === 'bitrate';
            filters.offset = (currentPage - 1) * ITEMS_PER_PAGE;
            filters.limit = ITEMS_PER_PAGE;
            filters.hidebroken = true;
        }

        function clearAllFilters() {
            searchInput.value = '';
            countryFilter.value = '';
            languageFilter.value = '';
            Array.from(tagFilter.options).forEach(option => option.selected = false);
            tagFilter.value = '';
            sortOptions.value = 'name';

            showingFavorites = false;
            favoritesButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg> Favoritos`;
            pagination.style.display = 'flex';

            currentPage = 1;
            updateFilters();
            searchStations();
        }

        async function searchStations() {
            showLoading(true);

            if (showingFavorites) {
                displayFavorites();
                return;
            }

            try {
                const countFiltersForTotal = { ...filters };
                delete countFiltersForTotal.offset;
                countFiltersForTotal.limit = 100000; 
                
                const allMatchingStationsForCount = await fetchData('/stations/search', countFiltersForTotal);
                totalStations = Array.isArray(allMatchingStationsForCount) ? allMatchingStationsForCount.length : 0;

                if (totalStations === 0) {
                    showNoResultsMessage('Nenhuma estação encontrada. Tente ajustar seus filtros de pesquisa.');
                    showLoading(false);
                    return;
                }

                const stationsData = await fetchData('/stations/search', filters);
                stations = stationsData;
                currentStationIndex = -1;

                displayStations(stations);
                updatePagination();

            } catch (error) {
                showNoResultsMessage('Ocorreu um erro ao buscar estações. Por favor, tente novamente mais tarde.');
            } finally {
                showLoading(false);
            }
        }

        function displayStations(stationsToDisplay) {
            radioGrid.innerHTML = '';
            if (stationsToDisplay.length === 0) {
                showNoResultsMessage('Nenhuma estação encontrada para a página atual.');
                return;
            }

            stationsToDisplay.forEach((station, index) => {
                const card = createStationCard(station);
                radioGrid.appendChild(card);
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        card.classList.add('card-visible');
                    }, 50 * index); 
                });
            });

            if (audioPlayer.src && currentPlayingCard) {
                const prevPlayingCard = document.querySelector(`.radio-card.playing`);
                if(prevPlayingCard) {
                    prevPlayingCard.classList.remove('playing');
                }
                const newPlayingCard = document.querySelector(`.radio-card[data-uuid="${currentPlayingCard.dataset.uuid}"]`);
                if (newPlayingCard) {
                    newPlayingCard.classList.add('playing');
                    currentPlayingCard = newPlayingCard;
                } else {
                    currentPlayingCard = null;
                }
            }
        }

        function createStationCard(station) {
            const card = document.createElement('div');
            card.className = 'radio-card';
            card.dataset.uuid = station.stationuuid;

            const isFavorite = favorites.includes(station.stationuuid);
            const favoriteClass = isFavorite ? 'favorite active' : 'favorite';

            const tags = station.tags ? station.tags.split(',').map(tag => tag.trim()).filter(tag => tag !== '').slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('') : '';

            card.innerHTML = `
                <div class="radio-image">
                    ${station.favicon ? `<img src="${station.favicon}" alt="Logo da ${station.name}" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/180x180/1f2937/9ca3af?text=Rádio&fontsize=20';">` : `<img src="https://via.placeholder.com/180x180/1f2937/9ca3af?text=Rádio&fontsize=20" alt="Logo padrão de rádio">`}
                </div>
                <div class="radio-info">
                    <h3 class="radio-name" title="${station.name}">${station.name}</h3>
                    <div class="radio-details">
                        <span>País: ${station.country || 'Desconhecido'}</span>
                        <span>Idioma: ${station.language || 'Desconhecido'}</span>
                        <div class="tags">${tags}</div>
                    </div>
                    <button class="${favoriteClass}" data-uuid="${station.stationuuid}" aria-label="${isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}">
                        <svg class="icon-heart-empty" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                        <svg class="icon-heart-filled" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
                    </button>
                </div>
                <div class="play-button"
                     data-url="${station.url_resolved || station.url}"
                     data-name="${station.name}"
                     data-info="${station.country || 'País Desconhecido'} - ${station.tags?.split(',')[0]?.trim() || 'Sem gênero'}"
                     data-uuid="${station.stationuuid}"
                     aria-label="Reproduzir estação ${station.name}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
            `;

            const playButton = card.querySelector('.play-button');
            playButton.addEventListener('click', () => {
                const stationData = {
                    url: playButton.dataset.url,
                    name: playButton.dataset.name,
                    info: playButton.dataset.info,
                    uuid: playButton.dataset.uuid
                };
                playStation(stationData);
            });

            const favoriteButton = card.querySelector('.favorite');
            favoriteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(station.stationuuid, favoriteButton);
            });

            return card;
        }

        function toggleFavorite(uuid, button) {
            const index = favorites.indexOf(uuid);

            if (index === -1) {
                favorites.push(uuid);
                button.classList.add('active');
                button.setAttribute('aria-label', 'Remover dos favoritos');
            } else {
                favorites.splice(index, 1);
                button.classList.remove('active');
                button.setAttribute('aria-label', 'Adicionar aos favoritos');

                if (showingFavorites) {
                    const card = button.closest('.radio-card');
                    card.remove();
                    if (favorites.length === 0) {
                        displayFavorites();
                    }
                }
            }
            localStorage.setItem('favorites', JSON.stringify(favorites));
        }

        async function displayFavorites() {
            radioGrid.innerHTML = '';
            showLoading(true);
            pagination.style.display = 'none';

            if (favorites.length === 0) {
                showNoResultsMessage('Nenhuma estação favorita. Adicione estações aos favoritos clicando no ícone de coração.');
                showLoading(false);
                return;
            }

            try {
                const favoriteStationsData = await fetchData('/stations/byuuid', { uuids: favorites.join(',') });
                stations = favoriteStationsData;
                currentStationIndex = -1;
                displayStations(stations);
            } catch (error) {
                showNoResultsMessage('Erro ao carregar estações favoritas. Por favor, tente novamente mais tarde.');
            } finally {
                showLoading(false);
            }
        }

        function playStation(stationData) {
            const { url, name, info, uuid } = stationData;

            let foundIndex = stations.findIndex(s => s.stationuuid === uuid);
            if (foundIndex === -1) {
                console.warn('Estação clicada não está na lista atual de estações carregadas. Adicionando temporariamente.');
                stations.push(stationData);
                currentStationIndex = stations.length - 1;
            } else {
                currentStationIndex = foundIndex;
            }

            audioPlayer.src = url;
            audioPlayer.volume = parseFloat(volumeControl.value);

            if (currentPlayingCard) {
                currentPlayingCard.classList.remove('playing');
            }

            const newPlayingCard = document.querySelector(`.radio-card[data-uuid="${uuid}"]`);
            if (newPlayingCard) {
                newPlayingCard.classList.add('playing');
                currentPlayingCard = newPlayingCard;
            } else {
                currentPlayingCard = null;
            }

            audioPlayer.play()
                .then(() => {
                    currentStation.textContent = name;
                    currentInfo.textContent = info;
                    player.classList.add('active');
                    playPauseButton.classList.add('playing');
                    trackStationClick(uuid);
                })
                .catch(error => {
                    displayPlaybackError(`Não foi possível reproduzir "${name}". A estação pode estar offline ou o formato não é suportado. Detalhes: ${error.message}`);
                    console.error('Erro ao tentar reproduzir a estação:', error);
                });
        }

        async function playNextStation() {
            if (stations && currentStationIndex >= 0 && currentStationIndex < stations.length - 1) {
                currentStationIndex++;
                const nextStation = stations[currentStationIndex];
                playStation({
                    url: nextStation.url_resolved || nextStation.url,
                    name: nextStation.name,
                    info: `${nextStation.country || 'Desconhecido'} - ${nextStation.tags?.split(',')[0]?.trim() || 'Sem gênero'}`,
                    uuid: nextStation.stationuuid
                });
            } else {
                const totalPages = Math.ceil(totalStations / ITEMS_PER_PAGE);
                if (!showingFavorites && currentPage < totalPages) {
                    currentPage++;
                    updateFilters();
                    showLoading(true);
                    await searchStations(); 

                    if (stations && stations.length > 0) {
                        currentStationIndex = 0;
                        const nextStation = stations[currentStationIndex];
                        playStation({
                            url: nextStation.url_resolved || nextStation.url,
                            name: nextStation.name,
                            info: `${nextStation.country || 'Desconhecido'} - ${nextStation.tags?.split(',')[0]?.trim() || 'Sem gênero'}`,
                            uuid: nextStation.stationuuid
                        });
                    } else {
                        displayPlaybackError('Não há mais estações disponíveis para reprodução nas próximas páginas.');
                        stopButton.click();
                    }
                } else {
                    displayPlaybackError('Você chegou ao final da lista de estações.');
                    stopButton.click();
                }
            }
        }

        function updatePagination() {
            pagination.innerHTML = '';
            const totalPages = Math.ceil(totalStations / ITEMS_PER_PAGE);

            if (totalPages <= 1) {
                pagination.style.display = 'none';
                return;
            }

            pagination.style.display = 'flex';

            const prevBtn = createPaginationButton('« Anterior', () => {
                if (currentPage > 1) {
                    currentPage--;
                    updateFilters();
                    searchStations();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 'Página anterior');
            prevBtn.disabled = currentPage === 1;
            pagination.appendChild(prevBtn);

            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, startPage + 4);

            for (let i = startPage; i <= endPage; i++) {
                const pageBtn = createPaginationButton(i, () => {
                    currentPage = i;
                    updateFilters();
                    searchStations();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }, `Página ${i}`);
                pageBtn.classList.toggle('active', i === currentPage);
                pagination.appendChild(pageBtn);
            }

            const nextBtn = createPaginationButton('Próximo »', () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    updateFilters();
                    searchStations();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }, 'Próxima página');
            nextBtn.disabled = currentPage === totalPages;
            pagination.appendChild(nextBtn);
        }

        function createPaginationButton(text, onClick, ariaLabel) {
            const button = document.createElement('button');
            button.textContent = text;
            button.addEventListener('click', onClick);
            button.setAttribute('aria-label', ariaLabel);
            return button;
        }

        searchInput.addEventListener('input', debounce(() => {
            if (!showingFavorites) {
                currentPage = 1;
                updateFilters();
                searchStations();
            }
        }, DEBOUNCE_DELAY));

        searchButton.addEventListener('click', () => {
            currentPage = 1;
            showingFavorites = false;
            favoritesButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg> Favoritos`;
            pagination.style.display = 'flex';
            updateFilters();
            searchStations();
        });

        favoritesButton.addEventListener('click', () => {
            showingFavorites = !showingFavorites;
            if (showingFavorites) {
                favoritesButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-radio"><circle cx="12" cy="12" r="2"/><path d="M4.93 19.07A10 10 0 0 1 12 22v-2A8 8 0 0 0 6.34 17.66"/><path d="M19.07 4.93A10 10 0 0 1 12 2v2A8 8 0 0 0 17.66 6.34"/><path d="M4.93 4.93A16 16 0 0 1 12 2v2A14 14 0 0 0 6.34 6.34"/><path d="M19.07 19.07A16 16 0 0 0 12 22v-2A14 14 0 0 1 17.66 17.66"/></svg> Todas as Estações`;
                displayFavorites();
            } else {
                favoritesButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg> Favoritos`;
                currentPage = 1;
                updateFilters();
                searchStations();
                pagination.style.display = 'flex';
            }
        });

        clearFiltersButton.addEventListener('click', clearAllFilters);

        [countryFilter, languageFilter, tagFilter, sortOptions].forEach(filter => {
            filter.addEventListener('change', () => {
                if (!showingFavorites) {
                    currentPage = 1;
                    updateFilters();
                    searchStations();
                }
            });
        });

        playPauseButton.addEventListener('click', () => {
            if (audioPlayer.paused) {
                if (audioPlayer.src) {
                    audioPlayer.play();
                    playPauseButton.classList.add('playing');
                } else if (stations && stations.length > 0) {
                    const stationToPlay = stations[currentStationIndex !== -1 ? currentStationIndex : 0];
                    if (stationToPlay) {
                        playStation({
                            url: stationToPlay.url_resolved || stationToPlay.url,
                            name: stationToPlay.name,
                            info: `${stationToPlay.country || 'Desconhecido'} - ${stationToPlay.tags?.split(',')[0]?.trim() || 'Sem gênero'}`,
                            uuid: stationToPlay.stationuuid
                        });
                    }
                } else {
                    displayError('Nenhuma estação selecionada para reprodução. Pesquise e clique em uma estação.');
                }
            } else {
                audioPlayer.pause();
                playPauseButton.classList.remove('playing');
            }
        });

        stopButton.addEventListener('click', () => {
            audioPlayer.pause();
            audioPlayer.src = '';
            player.classList.remove('active');
            playPauseButton.classList.remove('playing');
            currentStation.textContent = 'Nenhuma estação tocando';
            currentInfo.textContent = 'Aguardando seleção...';

            if (currentPlayingCard) {
                currentPlayingCard.classList.remove('playing');
                currentPlayingCard = null;
            }
            currentStationIndex = -1;
        });

        volumeControl.addEventListener('input', () => {
            audioPlayer.volume = parseFloat(volumeControl.value);
            localStorage.setItem('playerVolume', volumeControl.value);
            updateVolumeIcon(audioPlayer.volume);
        });

        audioPlayer.onerror = (e) => {
            console.error('Erro de áudio:', e);
            displayPlaybackError('A reprodução falhou. A estação pode estar offline ou o formato não é suportado.');
        };

        audioPlayer.onended = playNextStation;

        window.addEventListener('load', () => {
            loadFilters();
            updateFilters();
            searchStations();

            const savedVolume = localStorage.getItem('playerVolume');
            if (savedVolume !== null) {
                volumeControl.value = parseFloat(savedVolume);
            }
            audioPlayer.volume = parseFloat(volumeControl.value);
            updateVolumeIcon(audioPlayer.volume);
        });

        function replaceLucideIcons() {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
