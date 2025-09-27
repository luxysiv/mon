const BASE_API_URL = "https://phimapi.com";
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
 * Ánh xạ dữ liệu phim từ danh sách sang cấu trúc 'channel' cơ bản.
 */
function mapMovieToListChannel(movieData) {
    const categories = movieData.category ? movieData.category.map(c => c.name).join(', ') : 'Chưa rõ';
    
    return {
        id: movieData.slug, // Dùng slug làm ID để dễ dàng link đến trang chi tiết
        name: movieData.name,
        description: `Tình trạng: ${movieData.episode_current}. Năm: ${movieData.year}. Thể loại: ${categories}`,
        label: `${movieData.episode_current} - ${movieData.quality}`,
        image: {
            url: movieData.poster_url, // Dùng poster_url cho hình ảnh lớn hơn
            type: "contain",
            width: 1920,
            height: 1080
        },
        detail_url: `/phim/${movieData.slug}`, // URL để client fetch chi tiết
        display: "default",
        type: movieData.type === 'series' ? "series" : "single",
        enable_detail: true,
        sources: [] // Để trống vì link stream sẽ được tải ở API chi tiết
    };
}


/**
 * Hàm chính của Pages Function cho route '/'.
 */
export async function onRequest(context) {
    try {
        const url = new URL(context.request.url);
        const page = url.searchParams.get('page') || 1; 
        
        const newMoviesData = await fetchNewMovies(page);

        if (!newMoviesData || !newMoviesData.items) {
            return new Response(JSON.stringify({ error: "Không thể lấy danh sách phim." }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const channels = newMoviesData.items.map(mapMovieToListChannel);

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
