import type { MediaAsset } from './domain';
import { useMediaURL } from './MediaView';
export default function Avatar({asset,initial,className=''}:{asset?:MediaAsset;initial:string;className?:string}){
 const {url}=useMediaURL(asset?.id);
 return <span className={`avatar ${className} ${url?'has-image':''}`}>{url?<img src={url} alt="Аватар профиля"/>:initial}</span>;
}
