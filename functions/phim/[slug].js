const BASE_API_URL = "https://phimapi.com";

/**
 * Lấy chi tiết phim và ánh xạ sang cấu trúc chi tiết 'channel'.
 * Các link stream sẽ là link m3u8 gốc từ PhimAPI.
 * @param {Object} movieDetail Dữ liệu phim từ API chi tiết (detailData.movie).
 * @param {Array} episodes Dữ liệu tập phim (detailData.episodes).
 */
function mapMovieToChannelDetail(movieDetail, episodes) {
    // 1. Xây dựng các source (máy chủ/ngôn ngữ)
    const sources = (episodes || []).map((server) => {
        // Lấy tất cả các tập/link trong server này
        const streamLinks = (server.server_data || []).map((ep) => {
            // Lấy link m3u8 thuần
            const streamUrl = ep.link_m3u8; 
            if (!streamUrl) return null;
            
            return {
                id: `${ep.slug}-s1`,
                name: ep.name || "Server 1",
                url: streamUrl, // <-- LINK M3U8 THUẦN
                type: "hls", 
                default: true,
                enableP2P: true,
                subtitles: null,
                remote_data: null,
                request_headers: null,
                comments: null
            };
        }).filter(link => link !== null);

        // Tạo ID và Tên nguồn
        const sourceId = server.server_name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-');
        
        return {
            id: sourceId, 
            name: server.server_name,
            image: null,
            contents: [{
                id: `content-${sourceId}`,
                name: "",
                image: null,
                streams: [{
                    id: movieDetail.episode_current.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-'),
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
        };
    });

    // 2. Trả về đối tượng channel chi tiết
    return {
        id: movieDetail.slug, 
        name: movieDetail.name,
        title: movieDetail.origin_name, 
        description: movieDetail.content, 
        label: movieDetail.episode_current || "Full",
        image: {
            url: movieDetail.poster_url, 
            type: "contain",
            width: 1920,
            height: 1080
        },
        display: "default",
        type: "playlist", // Theo yêu cầu của bạn
        enable_detail: true,
        sources: sources,
        subtitle: movieDetail.lang,
    };
}


/**
 * Hàm chính của Pages Function cho route '/phim/[slug]'.
 */
export async function onRequest(context) {
    const slug = context.params.slug;

    if (!slug) {
        return new Response(JSON.stringify({ error: "Thiếu Slug (tên đường dẫn) của phim." }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        // 1. Lấy chi tiết phim
        const detailUrl = `${BASE_API_URL}/phim/${slug}`;
        const response = await fetch(detailUrl);

        if (!response.ok) {
            return new Response(JSON.stringify({ error: `Không tìm thấy chi tiết phim cho slug: ${slug}` }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const detailData = await response.json();
        
        if (!detailData.movie) {
             return new Response(JSON.stringify({ error: `Dữ liệu chi tiết phim không hợp lệ.` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 2. Chuyển đổi dữ liệu
        const finalJson = mapMovieToChannelDetail(detailData.movie, detailData.episodes);

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
