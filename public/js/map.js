mapboxgl.accessToken = mapToken;

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: listing.geometry.coordinates, // long, latitude
    zoom: 8.5,
});

map.on('load', function() {
    const marker1 = new mapboxgl.Marker()
        .setLngLat(listing.geometry.coordinates)
        .setPopup(new mapboxgl.Popup({offset: 25})
        .setHTML(`<h4>${listing.location}</h4><p>Exact location will be provided after booking</p>`))
        .addTo(map);
});
