/**
 * Cloudflare Pages Function để chuyển đổi API PhimAPI thành định dạng JSON Schema mong muốn.
 * Đường dẫn: /api/latest (ví dụ)
 */

// URL cơ sở của PhimAPI
const BASE_API_URL = "https://phimapi.com";
// Cấu hình tên nhà cung cấp và thông tin chung
const PROVIDER_INFO = {
    id: "phimapi-latest",
    name: "Phim Mới Cập Nhật",
    description: "Danh sách phim mới nhất được lấy từ PhimAPI",
    url: BASE_API_URL,
    color: "#2196F3",
    image: {
        url: "https://phimapi.com/phimimg/logo.png",
        type: "contain",
        height: 50,
        width: 50
    },
    grid_number: 4,
};

/**
 * Hàm chính để xử lý yêu cầu HTTP.
 * Pages Functions sẽ tự động chuyển URL và request vào context.
 * @param {Object} context Context chứa request, env, và params.
 */
export async function onRequest(context) {
    try {
        const url = new URL(context.request.url);
        const page = url.searchParams.get('page') || 1; // Hỗ trợ tham số ?page=X

        // 1. Lấy danh sách phim mới nhất
        const newMoviesData = await fetchNewMovies(page);

        if (!newMoviesData || !newMoviesData.items) {
            return new Response(JSON.stringify({ error: "Không thể lấy danh sách phim." }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 2. Lấy chi tiết và chuyển đổi từng phim
        const channels = [];
        // Giới hạn số lượng phim fetch chi tiết để tránh timeout
        const itemsToProcess = newMoviesData.items.slice(0, 10); 
        
        const moviePromises = itemsToProcess.map(async (movie) => {
            const channel = await mapMovieToChannel(movie);
            if (channel) {
                channels.push(channel);
            }
        });

        // Chờ tất cả các yêu cầu chi tiết phim hoàn thành
        await Promise.all(moviePromises);

        // 3. Xây dựng cấu trúc JSON cuối cùng
        const finalJson = {
            ...PROVIDER_INFO,
            groups: [{
                id: `latest-page-${page}`,
                name: `Phim Mới Cập Nhật (Trang ${page})`,
                display: "vertical",
                image: PROVIDER_INFO.image,
                grid_number: 1,
                enable_detail: true,
                channels: channels,
            }],
        };

        return new Response(JSON.stringify(finalJson, null, 2), {
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'Access-Control-Allow-Origin': '*',
            },
        });

    } catch (error) {
        console.error("Lỗi xử lý yêu cầu:", error);
        return new Response(JSON.stringify({ error: "Lỗi nội bộ của server.", details: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// --- Hàm Hỗ Trợ (Không thay đổi so với Worker) ---

/**
 * Lấy danh sách phim mới nhất từ PhimAPI.
 * @param {number} page Số trang.
 */
async function fetchNewMovies(page) {
    const url = `${BASE_API_URL}/danh-sach/phim-moi-cap-nhat-v3?page=${page}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Lỗi khi fetch danh sách phim: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Lấy chi tiết phim và ánh xạ sang cấu trúc 'channel'.
 * @param {Object} movieData Dữ liệu phim từ danh sách.
 */
async function mapMovieToChannel(movieData) {
    if (!movieData || !movieData.slug) return null;

    // 1. Lấy chi tiết phim để có link stream và mô tả đầy đủ
    const detailUrl = `${BASE_API_URL}/phim/${movieData.slug}`;
    const detailResponse = await fetch(detailUrl);
    if (!detailResponse.ok) {
        console.warn(`Không thể lấy chi tiết cho phim: ${movieData.name}`);
        // Tạo channel cơ bản nếu không lấy được chi tiết
        return createBasicChannel(movieData); 
    }
    const detailData = await detailResponse.json();
    const movieDetail = detailData.movie;
    const episodes = detailData.episodes || [];

    // 2. Xây dựng các source và stream
    const sources = [];
    episodes.forEach((server) => {
        const streamLinks = server.server_data.map((ep) => {
            const streamUrl = ep.link_m3u8 || ep.link_embed;
            
            if (!streamUrl) return null;

            return {
                id: `${movieData.slug}-${server.server_name.replace(/[^a-zA-Z0-9]/g, '-')}-${ep.slug}`,
                name: ep.name || "Server 1",
                url: streamUrl,
                type: "hls", 
                default: true,
                enableP2P: true,
                subtitles: null,
                remote_data: null,
                request_headers: null,
                comments: null
            };
        }).filter(link => link !== null);

        if (streamLinks.length > 0) {
            sources.push({
                id: `${movieData.slug}-${server.server_name.replace(/[^a-zA-Z0-9]/g, '-')}`,
                name: server.server_name.replace('#', '') || "Nguồn",
                image: null,
                contents: [{
                    id: `${movieData.slug}-content`,
                    name: movieDetail.name,
                    image: null,
                    streams: [{
                        id: `${movieData.slug}-stream`,
                        name: movieDetail.episode_current || "Full",
                        image: {
                            url: movieDetail.poster_url,
                            type: "contain",
                            width: 1920,
                            height: 1080
                        },
                        stream_links: streamLinks
                    }]
                }],
                remote_data: null
            });
        }
    });

    // 3. Trả về đối tượng channel
    return {
        id: movieDetail._id,
        name: movieDetail.name,
        description: movieDetail.content || movieDetail.origin_name,
        label: `${movieDetail.episode_current} - ${movieDetail.quality} - ${movieDetail.lang}`,
        image: {
            url: movieDetail.poster_url,
            type: "contain",
            width: 1920,
            height: 1080
        },
        display: "default",
        type: movieDetail.type === 'series' ? "series" : "single",
        enable_detail: true,
        sources: sources.length > 0 ? sources : createFallbackSource(movieDetail)
    };
}

/**
 * Tạo nguồn dự phòng khi không có link stream.
 */
function createFallbackSource(movieData) {
     return [{
        id: `${movieData._id}-no-source`,
        name: "Nguồn Phụ",
        image: null,
        contents: [{
            id: `${movieData._id}-content`,
            name: movieData.name,
            image: null,
            streams: [{
                id: `${movieData._id}-stream`,
                name: movieData.episode_current || "Full",
                image: {
                    url: movieData.poster_url,
                    type: "contain",
                    width: 1920,
                    height: 1080
                },
                stream_links: [{
                    id: `${movieData._id}-fallback`,
                    name: "Chưa có link stream",
                    url: "",
                    type: "other",
                    default: true,
                    enableP2P: false,
                    subtitles: null,
                    remote_data: null,
                    request_headers: null,
                    comments: "Không tìm thấy link m3u8. Cần thêm logic lấy link chi tiết."
                }]
            }]
        }],
        remote_data: null
    }];
}

/**
 * Tạo một channel cơ bản khi không thể lấy chi tiết phim (dùng cho lỗi fetch).
 */
function createBasicChannel(movieData) {
     return {
        id: movieData._id,
        name: movieData.name,
        description: `Phim: ${movieData.name}. Tình trạng: ${movieData.episode_current}`,
        label: `${movieData.episode_current} - ${movieData.quality} - ${movieData.lang}`,
        image: {
            url: movieData.poster_url,
            type: "contain",
            width: 1920,
            height: 1080
        },
        display: "default",
        type: movieData.type === 'series' ? "series" : "single",
        enable_detail: true,
        sources: createFallbackSource(movieData)
    };
}
